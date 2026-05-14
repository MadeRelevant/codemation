---
"create-codemation": patch
---

Add smoke seed workflow to managed scaffold template (`src/workflows/_smoke/smoke-workflow.ts`). Fires every 10 seconds via cron and emits `{event: "SMOKE_TICK"}` — used by the sprint-3 managed lifecycle smoke test to verify run events stream over WebSocket.
