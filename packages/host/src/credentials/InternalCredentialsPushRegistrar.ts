import { inject, injectable } from "@codemation/core";
import type { Hono } from "hono";
import type { Logger, LoggerFactory } from "../application/logging/Logger";
import { ApplicationTokens } from "../applicationTokens";
import type { CredentialStore } from "../domain/credentials/CredentialServices";
import { CredentialSecretCipher } from "../domain/credentials/CredentialSecretCipher";
import { InternalHmacAuthMiddleware } from "../pairing/InternalHmacAuthMiddleware";
import type { InternalHonoApiRouteRegistrar } from "../presentation/http/hono/InternalHonoApiRouteRegistrar";
import { CredentialInstanceService, CredentialTestService } from "../domain/credentials/CredentialServices";

/**
 * Body shape pushed from the control-plane OAuth broker after a successful
 * authorization code exchange. Defined per docs/pairing-protocol.md § Token Push.
 */
type CredentialPushBody = Readonly<{
  credentialInstanceId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: number;
  scopesGranted: ReadonlyArray<string>;
}>;

/**
 * Registers POST /internal/credentials/push — HMAC-verified endpoint that receives
 * OAuth tokens from the control-plane broker and writes them to the local credential store.
 *
 * If `refreshToken` is null/undefined the existing one is preserved (per Story 3 open question 5).
 */
@injectable()
export class InternalCredentialsPushRegistrar implements InternalHonoApiRouteRegistrar {
  private readonly logger: Logger;

  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(ApplicationTokens.CredentialStore) private readonly credentialStore: CredentialStore,
    @inject(CredentialSecretCipher) private readonly cipher: CredentialSecretCipher,
    @inject(CredentialInstanceService) private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CredentialTestService) private readonly credentialTestService: CredentialTestService,
    @inject(ApplicationTokens.LoggerFactory) loggerFactory: LoggerFactory,
  ) {
    this.logger = loggerFactory.create("InternalCredentialsPushRegistrar");
  }

  register(app: Hono): void {
    app.post("/internal/credentials/push", this.hmacMiddleware.handle(), async (c) => {
      try {
        const rawBody = c.get("body" as never) as string | undefined;
        const body: CredentialPushBody = rawBody ? JSON.parse(rawBody) : await c.req.json();

        if (!body.credentialInstanceId || typeof body.credentialInstanceId !== "string") {
          return c.json({ error: "credentialInstanceId is required" }, 400);
        }
        if (!body.accessToken || typeof body.accessToken !== "string") {
          return c.json({ error: "accessToken is required" }, 400);
        }

        const nowIso = new Date().toISOString();
        const expiryIso =
          typeof body.expiresAt === "number" ? new Date(body.expiresAt * 1000).toISOString() : undefined;

        // Merge: if the push omits refreshToken, preserve the existing one.
        const existingMaterial = await this.credentialStore.getOAuth2Material(body.credentialInstanceId);
        const existingDecrypted = existingMaterial ? this.cipher.decrypt(existingMaterial) : undefined;
        const refreshToken =
          body.refreshToken !== undefined && body.refreshToken !== null
            ? body.refreshToken
            : (existingDecrypted?.refresh_token as string | undefined);

        const tokenMaterial = Object.freeze({
          access_token: body.accessToken,
          refresh_token: refreshToken,
          expiry: expiryIso,
          scope: body.scopesGranted.join(" "),
        });

        const encrypted = this.cipher.encrypt(tokenMaterial);

        await this.credentialStore.saveOAuth2Material({
          instanceId: body.credentialInstanceId,
          encryptedJson: encrypted.encryptedJson,
          encryptionKeyId: encrypted.encryptionKeyId,
          schemaVersion: encrypted.schemaVersion,
          metadata: {
            providerId: body.credentialInstanceId,
            connectedAt: nowIso,
            scopes: [...body.scopesGranted],
            updatedAt: nowIso,
          },
        });

        // Attempt to mark the credential instance as ready if it exists.
        // Not a hard requirement — broker may push before the instance is created locally.
        try {
          await this.credentialInstanceService.markOAuth2Connected(body.credentialInstanceId, nowIso);
        } catch (markError) {
          this.logger.warn(
            "markOAuth2Connected failed (instance may not exist locally yet)",
            markError instanceof Error ? markError : undefined,
          );
        }

        this.logger.info(`Credential push applied for instance ${body.credentialInstanceId}`);

        // Auto-test the credential so the UI shows a real health badge
        // (healthy / failing) instead of "untested". For the broker type
        // this just validates the token material we just persisted, so it
        // never makes an outbound call to the provider. Soft-fails — a bad
        // test result shouldn't fail the push that already succeeded.
        try {
          await this.credentialTestService.test(body.credentialInstanceId);
        } catch (testError) {
          this.logger.warn(
            `Credential auto-test failed for instance ${body.credentialInstanceId}`,
            testError instanceof Error ? testError : undefined,
          );
        }

        return c.json({ ok: true });
      } catch (error) {
        this.logger.error("Credential push handler error", error instanceof Error ? error : undefined);
        return c.json({ error: "Internal server error" }, 500);
      }
    });
  }
}
