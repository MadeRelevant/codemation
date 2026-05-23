---
"@codemation/host": patch
---

fix(security): fail-closed on null principal for ?withSecrets=1 (Sprint 14.5 fix pass)

`CredentialHttpRouteHandler.getCredentialInstance` now returns 403 when the session verifier returns null (unauthenticated request) and `?withSecrets=1` is present, closing the silent pass-through gap that existed in local-auth mode.
