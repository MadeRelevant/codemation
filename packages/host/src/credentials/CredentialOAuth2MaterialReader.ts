import { inject, injectable } from "@codemation/core";
import type { Clock, OAuthFlowExecutor, OAuthMaterial } from "@codemation/core";

import { ApplicationTokens } from "../applicationTokens";
import type { LoggerFactory } from "../application/logging/Logger";
import { CredentialSecretCipher } from "../domain/credentials/CredentialSecretCipher";
import type {
  CredentialOAuth2MaterialRecord,
  CredentialStore,
} from "../domain/credentials/CredentialServices";

/**
 * Reads OAuth2 material for a credential instance and proactively refreshes it
 * when the stored access token is past (or within `REFRESH_LEAD_MS` of) expiry.
 *
 * Why this exists: most OAuth2 consumers in the host pipe an access token to a
 * raw HTTP call (MCP transport, webhook outbound, etc.) and have no SDK-level
 * 401-and-refresh behaviour. Without proactive refresh, the stored token goes
 * stale ~1h after the OAuth callback and every consumer fails with 401 until
 * the user manually reconnects. The Gmail trigger doesn't hit this because
 * `googleapis.OAuth2Client` refreshes internally — that's the exception, not
 * the rule.
 *
 * Concurrency: a single in-flight refresh per instanceId. Concurrent reads
 * during a refresh share the same promise so we don't invalidate the refresh
 * token by exchanging it twice in parallel.
 */
@injectable()
export class CredentialOAuth2MaterialReader {
  private static readonly REFRESH_LEAD_MS = 60_000;

  private readonly inFlightRefresh = new Map<string, Promise<OAuthMaterial>>();

  constructor(
    @inject(ApplicationTokens.CredentialStore) private readonly credentialStore: CredentialStore,
    @inject(CredentialSecretCipher) private readonly credentialSecretCipher: CredentialSecretCipher,
    @inject(ApplicationTokens.OAuthFlowExecutor) private readonly oauthFlowExecutor: OAuthFlowExecutor,
    @inject(ApplicationTokens.Clock) private readonly clock: Clock,
    @inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory,
  ) {}

  async readMaterial(instanceId: string): Promise<OAuthMaterial> {
    const encrypted = await this.credentialStore.getOAuth2Material(instanceId);
    if (!encrypted) {
      throw new Error(`CredentialOAuth2MaterialReader: instance "${instanceId}" has no OAuth2 material`);
    }
    const current = this.decrypt(encrypted);
    if (!this.shouldRefresh(current)) {
      return current;
    }
    return this.refreshSingleFlight(instanceId, current, encrypted);
  }

  private shouldRefresh(material: OAuthMaterial): boolean {
    if (!material.expiresAt) return false;
    if (!material.refreshToken) return false;
    const expiryMs = Date.parse(material.expiresAt);
    if (Number.isNaN(expiryMs)) return false;
    return this.clock.now().getTime() + CredentialOAuth2MaterialReader.REFRESH_LEAD_MS >= expiryMs;
  }

  private refreshSingleFlight(
    instanceId: string,
    current: OAuthMaterial,
    encrypted: CredentialOAuth2MaterialRecord,
  ): Promise<OAuthMaterial> {
    const inflight = this.inFlightRefresh.get(instanceId);
    if (inflight) return inflight;
    const next = this.doRefresh(instanceId, current, encrypted).finally(() => {
      this.inFlightRefresh.delete(instanceId);
    });
    this.inFlightRefresh.set(instanceId, next);
    return next;
  }

  private async doRefresh(
    instanceId: string,
    current: OAuthMaterial,
    encrypted: CredentialOAuth2MaterialRecord,
  ): Promise<OAuthMaterial> {
    const logger = this.loggers.create("CredentialOAuth2MaterialReader");
    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      throw new Error(`CredentialOAuth2MaterialReader: credential instance "${instanceId}" not found`);
    }
    let refreshed: OAuthMaterial;
    try {
      refreshed = await this.oauthFlowExecutor.refresh({ typeId: instance.typeId, instanceId, material: current });
    } catch (error) {
      logger.warn(
        `CredentialOAuth2MaterialReader: token refresh failed for instance "${instanceId}" — returning stale material`,
        error instanceof Error ? error : undefined,
      );
      return current;
    }
    const reEncrypted = this.credentialSecretCipher.encrypt({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? null,
      expiresAt: refreshed.expiresAt ?? null,
      grantedScopes: refreshed.grantedScopes.join(" "),
    });
    await this.credentialStore.saveOAuth2Material({
      instanceId,
      encryptedJson: reEncrypted.encryptedJson,
      encryptionKeyId: reEncrypted.encryptionKeyId,
      schemaVersion: reEncrypted.schemaVersion,
      metadata: {
        providerId: encrypted.providerId,
        connectedEmail: encrypted.connectedEmail,
        connectedAt: encrypted.connectedAt,
        scopes: [...refreshed.grantedScopes],
        updatedAt: this.clock.now().toISOString(),
      },
    });
    logger.info(`CredentialOAuth2MaterialReader: refreshed token for instance "${instanceId}"`);
    return refreshed;
  }

  private decrypt(record: CredentialOAuth2MaterialRecord): OAuthMaterial {
    const json = this.credentialSecretCipher.decrypt(record) as {
      accessToken?: unknown;
      refreshToken?: unknown;
      expiresAt?: unknown;
      grantedScopes?: unknown;
    };
    return {
      accessToken: typeof json.accessToken === "string" ? json.accessToken : "",
      refreshToken: typeof json.refreshToken === "string" ? json.refreshToken : undefined,
      expiresAt: typeof json.expiresAt === "string" ? json.expiresAt : undefined,
      grantedScopes:
        typeof json.grantedScopes === "string"
          ? json.grantedScopes.split(/\s+/).filter((s) => s.length > 0)
          : [],
    };
  }
}
