---
"@codemation/cli": minor
---

Add `--api-only` devMode (`codemation dev --api-only`) that skips spawning the workspace Next UI. Useful when an external host (e.g. the control plane customer-ui) serves the UI; only the API runtime, WebSocket, and proxy are started. Also respects `CODEMATION_DEV_MODE=api-only` env var.
