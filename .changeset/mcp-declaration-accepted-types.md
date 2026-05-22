---
"@codemation/core": minor
"@codemation/host": minor
"@codemation/core-nodes-gmail": minor
---

Replace `McpServerDeclaration.credentialKind` / `credentialTypeId` / `oauthAppKey` with `acceptedCredentialTypes?: ReadonlyArray<string>`, matching the `CredentialRequirement.acceptedTypes` shape. Absent or empty array means no credential required. Gmail MCP declaration now uses `["oauth.google.gmail"]`, the same type as the Gmail trigger node.
