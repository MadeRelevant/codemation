---
"@codemation/core": patch
---

perf(core): yield event loop between node activations in InlineDrivingScheduler

Switch `scheduleDrain` from `setTimeout(0)` to `setImmediate` and process one
activation per drain call instead of draining the entire queue in a while loop.
This ensures HTTP responses and WebSocket frames can flush to clients between
node activations — previously synchronous SQLite writes during a 20-node run
could block the proxy event loop for 3–4 s, making the canvas appear frozen
until the run completed.
