---
"@codemation/next-host": patch
---

test(next-host/credentials): cover copy-button, env-field-status, OAuth2 dialog states (Sprint 14 coverage)

- Add `CredentialFieldCopyButton.test.tsx`: clipboard write success, error path, empty-value disabled state, copied→idle timer reset.
- Add `CredentialEnvFieldStatusRow.test.tsx`: managed and missing render variants with aria-label assertions.
- Add `CredentialDialogFormSections.test.tsx`: OAuth2 redirect URI rendering, connect/reconnect/disconnect button states, event handler coverage (Select interactions, display name change, secrets toggle).
- Add `CredentialConfirmDialog.test.tsx`: confirm and cancel action smoke tests, variant rendering.
- Extend `CredentialDialogFieldRows.test.tsx`: sourceKind=env prop variant (env-ref input rendering, leave-blank hint in edit mode).
