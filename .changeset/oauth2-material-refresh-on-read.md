---
"@codemation/host": minor
---

Add `CredentialOAuth2MaterialReader` — a host service that reads stored OAuth2 material and proactively refreshes the access token via `OAuthFlowExecutor.refresh` when it's past expiry (or within a 60-second lead window). Re-encrypts and saves the refreshed material back so subsequent reads find a fresh token.

Wired into `McpConnectionPool` immediately: MCP HTTP transport had no SDK-level 401-and-refresh path (the Gmail trigger doesn't hit this because `googleapis.OAuth2Client` refreshes internally — that was the exception, not the rule). Before this change, the MCP pool happily sent expired tokens and the workflow failed with `401 — Request had invalid authentication credentials` about an hour after the user connected.

Concurrent reads share a single in-flight refresh per `instanceId` so the refresh token isn't exchanged twice in parallel. If the refresh call itself fails (e.g. revoked refresh token), the reader logs a warn and returns the stale material — the caller's downstream 401 is what surfaces the actual reconnect-required condition.
