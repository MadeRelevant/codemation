---
"@codemation/cli": patch
---

Fix workflow WebSocket proxy in managed-auth mode: per-client child sockets now forward the browser's `?token=` query parameter upstream, so the inner runtime's `ManagedAuthMiddleware` can authenticate the upgrade request. Previously a single shared child socket was opened without credentials, causing the runtime to return HTTP 401 and leaving the canvas stuck on the 5-second polling fallback.
