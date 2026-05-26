import { inject, injectable } from "@codemation/core";
import type {
  CallerContext,
  CredentialMaterialProvider,
  CredentialMaterialRef,
  MaterialBundle,
} from "@codemation/core";
import { IllegalMaterialSourceError } from "@codemation/core";

import { ApplicationTokens } from "../applicationTokens";
import { CredentialSecretCipher } from "../domain/credentials/CredentialSecretCipher";
import type { CredentialStore } from "../domain/credentials/CredentialServices";

/**
 * Local (OSS / standalone) implementation of `CredentialMaterialProvider`.
 *
 * Reads/writes OAuth material bytes through the existing `PrismaCredentialStore`
 * (i.e. the workspace's `CredentialOAuth2Material` table). The
 * `material:{source,ref}` pointer on the `CredentialInstance` row points back
 * at the row's own instance id for local credentials.
 *
 * Story 01 — this provider is registered in DI but no existing call site reads
 * through it yet. Story 02 wires the resolver to dispatch by `ref.source`.
 *
 * `callerContext` is accepted but ignored: standalone mode has no CP-side
 * audit log. See `docs/design/credentials-oauth-unification.md`
 * "Material provider seam".
 */
@injectable()
export class LocalCredentialMaterialProvider implements CredentialMaterialProvider {
  constructor(
    @inject(ApplicationTokens.CredentialStore) private readonly credentialStore: CredentialStore,
    @inject(CredentialSecretCipher) private readonly credentialSecretCipher: CredentialSecretCipher,
  ) {}

  async getMaterial(ref: CredentialMaterialRef, _context: CallerContext): Promise<MaterialBundle> {
    this.assertLocalSource(ref);
    const encrypted = await this.credentialStore.getOAuth2Material(ref.id);
    if (!encrypted) {
      throw new Error(`LocalCredentialMaterialProvider: no material for instance "${ref.id}"`);
    }
    const json = this.credentialSecretCipher.decrypt({
      encryptedJson: encrypted.encryptedJson,
      encryptionKeyId: encrypted.encryptionKeyId,
      schemaVersion: encrypted.schemaVersion,
    }) as {
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
          ? json.grantedScopes.split(/\s+/).filter((scope) => scope.length > 0)
          : encrypted.scopes,
    };
  }

  async setMaterial(ref: CredentialMaterialRef, material: MaterialBundle): Promise<void> {
    this.assertLocalSource(ref);
    const existing = await this.credentialStore.getOAuth2Material(ref.id);
    const encrypted = this.credentialSecretCipher.encrypt({
      accessToken: material.accessToken,
      refreshToken: material.refreshToken ?? null,
      expiresAt: material.expiresAt ?? null,
      grantedScopes: material.grantedScopes.join(" "),
    });
    const now = new Date().toISOString();
    await this.credentialStore.saveOAuth2Material({
      instanceId: ref.id,
      encryptedJson: encrypted.encryptedJson,
      encryptionKeyId: encrypted.encryptionKeyId,
      schemaVersion: encrypted.schemaVersion,
      metadata: {
        providerId: existing?.providerId ?? "",
        connectedEmail: existing?.connectedEmail,
        connectedAt: existing?.connectedAt,
        scopes: [...material.grantedScopes],
        updatedAt: now,
      },
    });
  }

  private assertLocalSource(ref: CredentialMaterialRef): void {
    if (ref.source !== "local") {
      throw new IllegalMaterialSourceError(ref.source, "LocalCredentialMaterialProvider");
    }
  }
}
