---
"@codemation/host": patch
---

Add `POST /internal/credentials/binding` — HMAC-paired internal endpoint that
lets the control-plane concierge bind a credential instance to a workflow
node slot on behalf of a workspace user. Wraps `CredentialBindingService.upsertBinding`
(same validation as the public upsert command) and is registered alongside
`InternalCredentialsPushRegistrar`.
