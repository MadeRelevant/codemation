import type { CredentialFieldSchema, CredentialTypeDefinition } from "@codemation/core";
import { inject, injectable } from "@codemation/core";

import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";

import type { JsonRecord } from "./CredentialServices";

@injectable()
export class CredentialFieldEnvOverlayService {
  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
  ) {}

  /** True when the field declares an env var and process.env has a non-empty string for it. */
  isFieldResolvedFromEnv(field: CredentialFieldSchema): boolean {
    const name = field.envVarName?.trim();
    if (!name) {
      return false;
    }
    const v = this.appConfig.env[name];
    return typeof v === "string" && v.length > 0;
  }

  apply(
    args: Readonly<{
      definition: CredentialTypeDefinition;
      publicConfig: JsonRecord;
      material: JsonRecord;
    }>,
  ): Readonly<{ resolvedPublicConfig: JsonRecord; resolvedMaterial: JsonRecord }> {
    const pub: Record<string, unknown> = { ...args.publicConfig };
    const mat: Record<string, unknown> = { ...args.material };
    for (const field of args.definition.publicFields ?? []) {
      const name = field.envVarName?.trim();
      if (!name) {
        continue;
      }
      const v = this.appConfig.env[name];
      if (typeof v === "string" && v.length > 0) {
        pub[field.key] = v;
      }
    }
    for (const field of args.definition.secretFields ?? []) {
      const name = field.envVarName?.trim();
      if (!name) {
        continue;
      }
      const v = this.appConfig.env[name];
      if (typeof v === "string" && v.length > 0) {
        mat[field.key] = v;
      }
    }
    return Object.freeze({
      resolvedPublicConfig: Object.freeze(pub),
      resolvedMaterial: Object.freeze(mat),
    });
  }
}
