import type { CredentialRequirement, RunnableNodeConfig } from "@codemation/core";

import { ConnectionCredentialNode } from "./ConnectionCredentialNode";

export class ConnectionCredentialNodeConfig implements RunnableNodeConfig {
  readonly kind = "node" as const;
  readonly type = ConnectionCredentialNode;

  constructor(
    public readonly name: string,
    private readonly credentialSource: { getCredentialRequirements?: () => ReadonlyArray<CredentialRequirement> },
  ) {}

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return this.credentialSource.getCredentialRequirements?.() ?? [];
  }
}
