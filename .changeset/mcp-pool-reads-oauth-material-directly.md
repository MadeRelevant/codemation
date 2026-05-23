---
"@codemation/host": patch
---

`McpConnectionPool` now reads OAuth material directly from the credential store + cipher instead of casting the credential session to an invented `McpOAuth2Session` shape. The previous path called `CredentialSessionServiceImpl.createSessionForInstance<McpOAuth2Session>(...)`, which was an unsafe generic cast — credential types' actual session shapes (e.g. `GmailSession`) don't implement `applyToRequest`, so the call threw `TypeError: session.applyToRequest is not a function` at runtime even though it type-checked.

The pool now resolves an instance's OAuth2 material via `credentialStore.getOAuth2Material(instanceId)` + `credentialSecretCipher.decrypt(...)` and builds the `authorization: Bearer <accessToken>` header from `material.accessToken` — bypassing the session entirely. Bound MCP credential types are already gated by `McpServerDeclaration.acceptedCredentialTypes` (OAuth2-shape verified at the catalog level), so the material is always available when binding succeeds.

`CredentialSessionServiceImpl.createSessionForInstance` is removed — it was only kept to feed this dead path. `McpOAuth2Session` (the fictional local type) is deleted.
