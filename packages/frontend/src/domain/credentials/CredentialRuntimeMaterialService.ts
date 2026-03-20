

import { inject,injectable } from "@codemation/core";



import { ApplicationTokens } from "../../applicationTokens";

import { CredentialMaterialResolver } from "./CredentialMaterialResolver";
import { CredentialSecretCipher } from "./CredentialSecretCipher";
import type { CredentialInstanceRecord,CredentialStore,JsonRecord } from "./CredentialServices";
import { CredentialTypeRegistryImpl } from "./CredentialServices";

@injectable()
export class CredentialRuntimeMaterialService {
  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialMaterialResolver)
    private readonly credentialMaterialResolver: CredentialMaterialResolver,
    @inject(CredentialSecretCipher)
    private readonly credentialSecretCipher: CredentialSecretCipher,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
  ) {}

  async compose(instance: CredentialInstanceRecord): Promise<JsonRecord> {
    const baseMaterial = await this.credentialMaterialResolver.resolveMaterial(instance);
    const auth = this.credentialTypeRegistry.getRegisteredType(instance.typeId)?.definition.auth;
    if (auth?.kind !== "oauth2") {
      return baseMaterial;
    }
    const oauth2Material = await this.credentialStore.getOAuth2Material(instance.instanceId);
    if (!oauth2Material) {
      return baseMaterial;
    }
    const decryptedOauth2Material = this.credentialSecretCipher.decrypt(oauth2Material);
    return Object.freeze({
      ...baseMaterial,
      ...decryptedOauth2Material,
    });
  }
}
