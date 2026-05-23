---
"@codemation/host": minor
---

Add McpConnectionPool — lazy, keyed MCP client pool for managed HTTP connections.

Pools `experimental_createMCPClient` connections keyed by `(credentialInstanceId, serverId)`.
Reads bearer tokens fresh from the OAuth2-via-broker credential session at open time.
Caches `tools/list` results per entry and applies `toolDescriptionOverrides` from the catalog declaration.
Supports `closeForCredential` (revocation) and `closeAll` (host shutdown).
