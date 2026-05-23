---
"@codemation/cli": patch
---

Fix dev proxy not forwarding `/internal/*` requests to the inner runtime. Previously these fell through to the Next.js UI proxy; now they are routed to the runtime (or return 503 when building/errored), enabling workspace-mcp HMAC calls to `/internal/workflows` and `/internal/credentials`.
