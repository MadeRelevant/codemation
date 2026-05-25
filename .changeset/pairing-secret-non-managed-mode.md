---
"@codemation/host": patch
---

fix(host): only throw on invalid WORKSPACE_PAIRING_SECRET in managed mode

Previously, setting WORKSPACE_PAIRING_SECRET to an invalid value (not a 32-byte base64 string) would crash the host at boot time even when running in non-managed mode (the default). Framework consumers who accidentally set this env var or left a misconfigured value would see an opaque boot error unrelated to their actual configuration.

After this fix, the invalid-secret error is only propagated in `auth.kind: "managed"` mode. In all other modes, the error is caught, a warning is logged, and the host boots normally without pairing infrastructure wired up. Managed-mode consumers continue to see the full error at startup.
