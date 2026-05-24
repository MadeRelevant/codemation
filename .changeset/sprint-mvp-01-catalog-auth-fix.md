---
"@codemation/host": patch
---

Fix ControlPlaneCatalogFetcher calling wrong URL path (sprint-mvp/01).

The fetcher was calling `/api/catalog/*` (session-gated in the CP) instead of
`/internal/catalog/*` (HMAC-gated). The CP's `/api/*` router returned 401 for
every HMAC-signed request because it requires a Better Auth session cookie, not a
workspace pairing signature.

This caused every provisioned workspace to log steady `HTTP 401 Unauthorized`
errors from `ControlPlaneCatalogFetcher`, blocking OAuth credential-type and MCP
server catalog fetches.
