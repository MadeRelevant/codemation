---
"@codemation/host": patch
---

test(host/persistence): cascade-on-delete integration tests (Sprint 13 Story C)

Adds `cascadeOnDelete.integration.test.ts` covering all 8 `onDelete: Cascade`
relationships declared in `schema.postgresql.prisma`. Each test creates a parent
row and N child rows, deletes the parent, and asserts the child count drops to 0.

Relationships tested:

- `RunWorkItem → Run`
- `ExecutionInstance → Run`
- `RunSlotProjection → Run`
- `TestAssertion → Run`
- `TestAssertion → TestSuiteRun`
- `UserInvite → User`
- `Account → User`
- `Session → User`

Gaps noted (no cascade declared in schema, no schema changes made):

- `Credential*` tables (CredentialSecretMaterial, CredentialOAuth2Material, etc.)
  share `instanceId` with `CredentialInstance` but have no `@relation onDelete:
Cascade`. GDPR right-to-erasure risk.
- No `Workspace` model exists in `schema.postgresql.prisma`.
