---
"@codemation/host": patch
---

fix(credentials): require ownership for ?withSecrets=1 (Sprint 14 Story 03)

`CredentialHttpRouteHandler.getCredentialInstance` now enforces workspace
ownership when `?withSecrets=1` is requested. In managed-auth mode a principal
with a `workspaceId` that differs from the installation's `pairingConfig.workspaceId`
receives 403 Forbidden. Local-auth mode (no pairingConfig) is unchanged.
