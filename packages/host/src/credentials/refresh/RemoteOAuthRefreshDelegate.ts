import { inject, injectable } from "@codemation/core";
import type { Logger, LoggerFactory } from "../../application/logging/Logger";
import { ApplicationTokens } from "../../applicationTokens";
import type { CredentialStore } from "../../domain/credentials/CredentialServices";
import { CredentialSecretCipher } from "../../domain/credentials/CredentialSecretCipher";
import { BrokerClient } from "../BrokerClient";
import { BrokerRefreshInvalidGrantError } from "../BrokerRefreshInvalidGrantError";
import { CredentialDisconnectedError } from "./CredentialDisconnectedError";

export type RefreshResult = Readonly<{
  accessToken: string;
  expiryIso: string | undefined;
}>;

export { CredentialDisconnectedError };

/**
 * Retrieves a valid access token for a credential instance, refreshing via the
 * broker if the stored token is expired or within the 60-second buffer window.
 *
 * Single-flight: concurrent callers for the same instanceId await one shared
 * refresh call. In-memory Map is used per sprint-2 assumption: single-process
 * installation. See Story 4 open question 4 — swap for a distributed lock when
 * the installation goes multi-process.
 */
@injectable()
export class RemoteOAuthRefreshDelegate {
  /** Refresh 60 s before actual expiry to avoid in-flight expiry. */
  private static readonly refreshBufferSeconds = 60;

  /** Single-flight dedup: instanceId → in-flight Promise. Cleared on settle. */
  private readonly inflightRefreshes = new Map<string, Promise<RefreshResult>>();
  private readonly logger: Logger;

  constructor(
    @inject(ApplicationTokens.CredentialStore) private readonly credentialStore: CredentialStore,
    @inject(CredentialSecretCipher) private readonly cipher: CredentialSecretCipher,
    @inject(BrokerClient) private readonly brokerClient: BrokerClient,
    @inject(ApplicationTokens.LoggerFactory) loggerFactory: LoggerFactory,
  ) {
    this.logger = loggerFactory.create("RemoteOAuthRefreshDelegate");
  }

  getAccessToken(credentialInstanceId: string): Promise<RefreshResult> {
    const existing = this.inflightRefreshes.get(credentialInstanceId);
    if (existing !== undefined) {
      return existing;
    }
    const promise = this.resolveOrRefresh(credentialInstanceId).finally(() => {
      this.inflightRefreshes.delete(credentialInstanceId);
    });
    this.inflightRefreshes.set(credentialInstanceId, promise);
    return promise;
  }

  private async resolveOrRefresh(credentialInstanceId: string): Promise<RefreshResult> {
    const material = await this.credentialStore.getOAuth2Material(credentialInstanceId);
    if (!material) {
      throw new Error(`No OAuth2 material found for credential instance ${credentialInstanceId}.`);
    }

    const decrypted = this.cipher.decrypt(material);
    const accessToken = decrypted.access_token;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new Error(`Credential ${credentialInstanceId}: stored access_token is missing or invalid.`);
    }

    const expiryIso =
      typeof decrypted.expiry === "string" && decrypted.expiry.length > 0 ? decrypted.expiry : undefined;

    if (this.isStillValid(expiryIso)) {
      return { accessToken, expiryIso };
    }

    // Token is expired or within the buffer — refresh via the broker.
    const refreshToken = decrypted.refresh_token;
    if (typeof refreshToken !== "string" || refreshToken.length === 0) {
      throw new CredentialDisconnectedError(credentialInstanceId);
    }

    this.logger.debug(`Access token expired; refreshing via broker for instance ${credentialInstanceId}`);

    let refreshed;
    try {
      refreshed = await this.brokerClient.refreshCredential({
        credentialInstanceId,
        refreshToken,
      });
    } catch (error) {
      if (error instanceof BrokerRefreshInvalidGrantError) {
        throw new CredentialDisconnectedError(credentialInstanceId);
      }
      throw error;
    }

    const nowIso = new Date().toISOString();
    const newExpiryIso = new Date(refreshed.expiresAt * 1000).toISOString();

    const updatedMaterial = Object.freeze({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken ?? refreshToken,
      expiry: newExpiryIso,
      scope: refreshed.scopesGranted.join(" "),
    });

    const encrypted = this.cipher.encrypt(updatedMaterial);
    await this.credentialStore.saveOAuth2Material({
      instanceId: credentialInstanceId,
      encryptedJson: encrypted.encryptedJson,
      encryptionKeyId: encrypted.encryptionKeyId,
      schemaVersion: encrypted.schemaVersion,
      metadata: {
        providerId: material.providerId,
        connectedEmail: material.connectedEmail,
        connectedAt: material.connectedAt,
        scopes: [...refreshed.scopesGranted],
        updatedAt: nowIso,
      },
    });

    this.logger.info(`Access token refreshed via broker for instance ${credentialInstanceId}`);

    return { accessToken: refreshed.accessToken, expiryIso: newExpiryIso };
  }

  private isStillValid(expiryIso: string | undefined): boolean {
    if (!expiryIso) {
      // No expiry recorded — assume valid (non-expiring token or push omitted expiresAt).
      return true;
    }
    const expiryMs = new Date(expiryIso).getTime();
    const bufferMs = RemoteOAuthRefreshDelegate.refreshBufferSeconds * 1000;
    return expiryMs > Date.now() + bufferMs;
  }
}
