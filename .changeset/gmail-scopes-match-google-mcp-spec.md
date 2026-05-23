---
"@codemation/core-nodes-gmail": minor
---

Align Gmail OAuth scopes with Google's documented Gmail MCP server requirement.

Per https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server, Google's Gmail MCP endpoint (`https://gmailmcp.googleapis.com/mcp/v1`) enforces a **literal scope check** for `https://www.googleapis.com/auth/gmail.readonly` + `https://www.googleapis.com/auth/gmail.compose`. It does not recognize semantic supersets — a token scoped only to `gmail.modify` is rejected with `403 "The caller does not have permission"` even though `gmail.modify` covers reading and writing for messages and threads at the Gmail API level.

Updated:
- `GMAIL_DEFAULT_SCOPES`: `gmail.modify` + `gmail.labels` → `gmail.readonly` + `gmail.compose`.
- `gmailMcpServer.requiredScopes`: `gmail.modify` → `gmail.readonly` + `gmail.compose`.

Existing connected credentials will need to disconnect and reconnect to obtain a token with the correct scope set; the MCP scope-validation gate at activation time will surface a "missing required scopes" error pointing at the right path until they do.
