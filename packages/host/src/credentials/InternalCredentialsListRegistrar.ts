import { inject, injectable } from "@codemation/core";
import type { Hono } from "hono";
import { ApplicationTokens } from "../applicationTokens";
import type { CredentialStore } from "../domain/credentials/CredentialServices";
import { InternalHmacAuthMiddleware } from "../pairing/InternalHmacAuthMiddleware";
import type { InternalHonoApiRouteRegistrar } from "../presentation/http/hono/InternalHonoApiRouteRegistrar";

/**
 * Registers GET /internal/credentials — HMAC-verified endpoint that returns the status
 * list of credential instances (no token material). Used by the concierge (Story 5) to
 * inspect what credentials are connected.
 */
@injectable()
export class InternalCredentialsListRegistrar implements InternalHonoApiRouteRegistrar {
  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(ApplicationTokens.CredentialStore) private readonly credentialStore: CredentialStore,
  ) {}

  register(app: Hono): void {
    app.get("/internal/credentials", this.hmacMiddleware.handle(), async (c) => {
      const instances = await this.credentialStore.listInstances();
      const result = await Promise.all(
        instances.map(async (instance) => {
          const oauth2Material = await this.credentialStore.getOAuth2Material(instance.instanceId);
          return {
            instanceId: instance.instanceId,
            typeId: instance.typeId,
            displayName: instance.displayName,
            setupStatus: instance.setupStatus,
            createdAt: instance.createdAt,
            updatedAt: instance.updatedAt,
            oauth2: oauth2Material
              ? {
                  providerId: oauth2Material.providerId,
                  connectedEmail: oauth2Material.connectedEmail,
                  connectedAt: oauth2Material.connectedAt,
                  scopes: oauth2Material.scopes,
                  updatedAt: oauth2Material.updatedAt,
                }
              : null,
          };
        }),
      );
      return c.json(result);
    });
  }
}
