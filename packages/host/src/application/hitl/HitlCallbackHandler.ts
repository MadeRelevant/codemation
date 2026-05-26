import { inject, injectable } from "@codemation/core";
import type { HumanTaskStore, JsonValue } from "@codemation/core";
import { HumanTaskStoreToken } from "@codemation/core";
import type { Logger } from "../logging/Logger";
import type { PairingConfig } from "../../pairing/pairing.types";
import { PairingConfigToken } from "../../pairing/PairingConfigToken";
import { ServerLoggerFactory } from "../../infrastructure/logging/ServerLoggerFactory";
import { DecideHumanTaskCommandHandler } from "./DecideHumanTaskCommandHandler";
import { ApplicationRequestError } from "../ApplicationRequestError";

export type HitlCallbackBody =
  | { kind: "timeout" }
  | {
      decision: JsonValue;
      actor?: { actorId: string; displayName?: string };
    };

export type HitlCallbackResult =
  | { status: 200; body: { ok: true } }
  | { status: 400 | 403 | 404 | 409 | 422 | 503; body: { error: string } };

/**
 * Handler for inbound HITL decision callbacks from the control plane.
 *
 * Validates the callback body, checks workspace identity, and delegates to
 * `DecideHumanTaskCommandHandler` for the actual decision/timeout logic.
 *
 * Workspace identity is asserted via `PairingConfig.workspaceId` — the HMAC
 * middleware already guarantees the request is signed by the paired CP, so
 * this is a secondary assertion matching the task's stored workspace.
 *
 * D3: The framework's timeout worker and CP's callback can both fire for the
 * same task. Whichever lands first wins; the second gets a 409 from
 * `markDecided`/`markTimedOut` (task already resolved). This is intentional.
 */
@injectable()
export class HitlCallbackHandler {
  private readonly logger: Logger;

  constructor(
    @inject(HumanTaskStoreToken) private readonly taskStore: HumanTaskStore | undefined,
    @inject(PairingConfigToken) private readonly pairingConfig: PairingConfig,
    @inject(DecideHumanTaskCommandHandler) private readonly decideHandler: DecideHumanTaskCommandHandler,
    @inject(ServerLoggerFactory) loggerFactory: ServerLoggerFactory,
  ) {
    this.logger = loggerFactory.create("codemation.hitl.callback");
  }

  async handle(taskId: string, body: HitlCallbackBody): Promise<HitlCallbackResult> {
    if (!this.taskStore) {
      return { status: 503, body: { error: "HITL is not available in this configuration" } };
    }

    const task = await this.taskStore.findById(taskId);
    if (!task) {
      return { status: 404, body: { error: "HumanTask not found" } };
    }

    // Assert workspace identity: only the CP paired to this workspace may call back
    if (task.workspaceId !== undefined && task.workspaceId !== this.pairingConfig.workspaceId) {
      this.logger.warn(
        `HITL callback workspace mismatch — taskId=${taskId} taskWorkspaceId=${task.workspaceId} pairingWorkspaceId=${this.pairingConfig.workspaceId}`,
      );
      return { status: 403, body: { error: "Workspace mismatch" } };
    }

    if (task.status !== "pending") {
      return { status: 409, body: { error: `HumanTask is not pending (current status: ${task.status})` } };
    }

    // Timeout path (story 07 D3: CP-originated timeout)
    if ("kind" in body && body.kind === "timeout") {
      await this.taskStore.markTimedOut(taskId);
      this.logger.info(`HITL task timed out via CP callback — taskId=${taskId}`);
      return { status: 200, body: { ok: true } };
    }

    const decisionBody = body as { decision: JsonValue; actor?: { actorId: string; displayName?: string } };

    try {
      await this.decideHandler.decide({
        taskId,
        decision: decisionBody.decision,
        decidedBy: decisionBody.actor ?? { actorId: "cp-reviewer" },
      });
    } catch (err) {
      if (err instanceof ApplicationRequestError) {
        return { status: err.status as 400 | 403 | 404 | 409 | 422 | 503, body: { error: err.message } };
      }
      throw err;
    }

    this.logger.info(`HITL task decided via CP callback — taskId=${taskId}`);
    return { status: 200, body: { ok: true } };
  }
}
