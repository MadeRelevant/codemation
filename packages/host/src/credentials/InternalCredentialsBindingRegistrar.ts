import { inject, injectable } from "@codemation/core";
import type { Hono } from "hono";
import type { Logger, LoggerFactory } from "../application/logging/Logger";
import { ApplicationRequestError } from "../application/ApplicationRequestError";
import { ApplicationTokens } from "../applicationTokens";
import { CredentialBindingService } from "../domain/credentials/CredentialServices";
import { InternalHmacAuthMiddleware } from "../pairing/InternalHmacAuthMiddleware";
import type { InternalHonoApiRouteRegistrar } from "../presentation/http/hono/InternalHonoApiRouteRegistrar";

/**
 * Body shape pushed from the control-plane concierge when binding a
 * credential instance to a workflow node slot.
 *
 * Note: the original story brief described the body as
 * `{ credentialInstanceId, nodeId, slotName }`, but `CredentialBinding`
 * requires a `workflowId` and the codebase uses `slotKey` (not `slotName`).
 * The request shape was corrected here and on the matching concierge tool.
 */
type CredentialBindingBody = Readonly<{
  workflowId: string;
  nodeId: string;
  slotKey: string;
  credentialInstanceId: string;
}>;

/**
 * Registers POST /internal/credentials/binding — HMAC-verified endpoint that
 * lets the control-plane concierge bind a credential instance to a workflow
 * node slot on behalf of a workspace user.
 */
@injectable()
export class InternalCredentialsBindingRegistrar implements InternalHonoApiRouteRegistrar {
  private readonly logger: Logger;

  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(CredentialBindingService) private readonly credentialBindingService: CredentialBindingService,
    @inject(ApplicationTokens.LoggerFactory) loggerFactory: LoggerFactory,
  ) {
    this.logger = loggerFactory.create("InternalCredentialsBindingRegistrar");
  }

  register(app: Hono): void {
    app.post("/internal/credentials/binding", this.hmacMiddleware.handle(), async (c) => {
      try {
        const rawBody = c.get("body" as never) as string | undefined;
        const body = (rawBody ? JSON.parse(rawBody) : await c.req.json()) as Partial<CredentialBindingBody>;

        if (!body.workflowId || typeof body.workflowId !== "string") {
          return c.json({ error: "workflowId is required" }, 400);
        }
        if (!body.nodeId || typeof body.nodeId !== "string") {
          return c.json({ error: "nodeId is required" }, 400);
        }
        if (!body.slotKey || typeof body.slotKey !== "string") {
          return c.json({ error: "slotKey is required" }, 400);
        }
        if (!body.credentialInstanceId || typeof body.credentialInstanceId !== "string") {
          return c.json({ error: "credentialInstanceId is required" }, 400);
        }

        const binding = await this.credentialBindingService.upsertBinding({
          workflowId: body.workflowId,
          nodeId: body.nodeId,
          slotKey: body.slotKey,
          instanceId: body.credentialInstanceId,
        });

        this.logger.info(
          `Credential binding upserted for workflow=${body.workflowId} node=${body.nodeId} slot=${body.slotKey}`,
        );

        return c.json({ ok: true, binding });
      } catch (error) {
        if (error instanceof ApplicationRequestError) {
          return c.json(error.payload, error.status as 400 | 404);
        }
        this.logger.error("Credential binding handler error", error instanceof Error ? error : undefined);
        return c.json({ error: "Internal server error" }, 500);
      }
    });
  }
}
