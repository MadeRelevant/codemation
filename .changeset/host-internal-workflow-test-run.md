---
"@codemation/host": minor
---

Add `POST /internal/workflows/:id/test-run` HMAC-protected endpoint. Runs a workflow once synchronously without requiring it to be active, letting the coding agent verify a workflow before activating it. Body: `{ input?: unknown }`. Returns `{ ok, runId?, output?, error?, durationMs }` with a 30-second timeout.
