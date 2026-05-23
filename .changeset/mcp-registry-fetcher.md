---
"@codemation/host": minor
---

Add `McpRegistryFetcher` — installation-side polling service that fetches `GET /internal/registry/mcp-servers` from the control plane via the paired HMAC channel on startup and on a configurable interval (default 5 minutes), merging results into `McpServerCatalog` as source `"controlPlane"` (Story 13).
