import type { CredentialFieldSchema } from "@codemation/core";
import { inject } from "@codemation/core";

import { ApplicationTokens } from "../../applicationTokens";
import { QueryHandler } from "../bus/QueryHandler";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { CredentialTypeRegistryImpl } from "../../domain/credentials/CredentialServices";

import { GetCredentialFieldEnvStatusQuery, type CredentialFieldEnvStatusDto } from "./GetCredentialFieldEnvStatusQuery";

@HandlesQuery.for(GetCredentialFieldEnvStatusQuery)
export class GetCredentialFieldEnvStatusQueryHandler extends QueryHandler<
  GetCredentialFieldEnvStatusQuery,
  CredentialFieldEnvStatusDto
> {
  constructor(
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(ApplicationTokens.ProcessEnv)
    private readonly env: Readonly<NodeJS.ProcessEnv>,
  ) {
    super();
  }

  async execute(): Promise<CredentialFieldEnvStatusDto> {
    const names = new Set<string>();
    for (const type of this.credentialTypeRegistry.listTypes()) {
      for (const n of this.collectEnvVarNames(type.publicFields)) {
        names.add(n);
      }
      for (const n of this.collectEnvVarNames(type.secretFields)) {
        names.add(n);
      }
    }
    const out: Record<string, boolean> = {};
    for (const name of names) {
      const v = this.env[name];
      out[name] = typeof v === "string" && v.length > 0;
    }
    return Object.freeze(out);
  }

  private collectEnvVarNames(fields: ReadonlyArray<CredentialFieldSchema> | undefined): ReadonlyArray<string> {
    if (!fields) {
      return [];
    }
    return fields
      .map((f) => f.envVarName)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  }
}
