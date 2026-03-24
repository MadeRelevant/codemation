import type { CredentialRequirement } from "@codemation/core";

import { ConnectionCredentialNodeConfig } from "./ConnectionCredentialNodeConfig";

export class ConnectionCredentialNodeConfigFactory {
  create(
    name: string,
    credentialSource: { getCredentialRequirements?: () => ReadonlyArray<CredentialRequirement> },
  ): ConnectionCredentialNodeConfig {
    return new ConnectionCredentialNodeConfig(name, credentialSource);
  }
}
