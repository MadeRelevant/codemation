---
"@codemation/canvas-core": patch
---

Demote routine `workflow-realtime.frontend` logs to debug level (per-event/per-frame messages: snapshot events, subscriptions, raw websocket frames, rebuild notifications). Important transitions (websocket enabled, transport opened, token expired) stay at info. Reduces console noise during normal dev/runtime; full verbosity still available via `CODEMATION_LOG_LEVEL=debug`.
