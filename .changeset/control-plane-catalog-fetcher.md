---
"@codemation/host": minor
---

Add `ControlPlaneCatalogFetcher` — polls the three control-plane catalog endpoints (`/api/catalog/oauth-apps`, `/api/catalog/mcp-servers`, `/api/catalog/credential-types`) on a configurable interval, caches last-known-good responses per endpoint independently, and exposes `oauthApps`, `mcpServers`, and `credentialTypeOverrides` getters. No-ops when pairing config is absent.
