---
"@codemation/host": patch
---

feat(host): in-memory TTL cache for credential material

Add `CachingCredentialMaterialProvider` — a decorator around
`CredentialMaterialProvider` that holds decrypted material bytes in a
process-local `Map` keyed by `(source, id)`. TTL is
`min(material.expiresAt − 60s, now + 5min)` (5-minute hard cap, never
serialized to disk, never shared across pods). `setMaterial` invalidates
the cached entry so the next read re-fetches fresh bytes. Registered as
a singleton in `AppContainerFactory`; wraps `LocalCredentialMaterialProvider`
today and will wrap the source-dispatching provider once story 02 lands.
