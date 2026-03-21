

import { inject,injectable } from "@codemation/core";



import { ApplicationTokens } from "../../applicationTokens";

import { CredentialSecretCipher } from "./CredentialSecretCipher";
import type { CredentialInstanceRecord,CredentialStore,JsonRecord } from "./CredentialServices";

@injectable()
export class CredentialMaterialResolver {
  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialSecretCipher)
    private readonly credentialSecretCipher: CredentialSecretCipher,
    @inject(ApplicationTokens.ProcessEnv)
    private readonly env: Readonly<NodeJS.ProcessEnv>,
  ) {}

  async resolveMaterial(instance: CredentialInstanceRecord): Promise<JsonRecord> {
    if (instance.secretRef.kind === "db") {
      const secretMaterial = await this.credentialStore.getSecretMaterial(instance.instanceId);
      if (!secretMaterial) {
        throw new Error(`Credential ${instance.instanceId} is missing encrypted secret material.`);
      }
      return this.credentialSecretCipher.decrypt(secretMaterial);
    }
    if (instance.secretRef.kind === "env") {
      return this.resolveEnvMaterial(instance);
    }
    return instance.secretRef.value;
  }

  private resolveEnvMaterial(instance: CredentialInstanceRecord): JsonRecord {
    if (instance.secretRef.kind !== "env") {
      throw new Error(`Credential ${instance.instanceId} is not environment-backed.`);
    }
    const resolved: Record<string, unknown> = {};
    const missingEnvironmentVariables: string[] = [];
    for (const [fieldKey, envVarName] of Object.entries(instance.secretRef.envByField)) {
      const value = this.env[envVarName];
      if (value === undefined || value.length === 0) {
        missingEnvironmentVariables.push(envVarName);
        continue;
      }
      resolved[fieldKey] = value;
    }
    if (missingEnvironmentVariables.length > 0) {
      throw new Error(
        `Credential ${instance.instanceId} requires environment variables that are not set: ${missingEnvironmentVariables.join(", ")}.`,
      );
    }
    return resolved;
  }
}
