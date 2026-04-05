---
"@codemation/cli": patch
---

Route `/api/auth/*` on the dev gateway to the disposable API runtime (same as other `/api/*` routes) so host-owned Better Auth is not bounced through the Next UI process. Avoids gateway↔Next proxy loops when `CODEMATION_RUNTIME_DEV_URL` points at the stable dev URL.
