---
"@codemation/core": patch
"@codemation/host": patch
---

feat(host,core): credential material provider seam + material:{source,ref} field

Adds the persistence seam that lets credential material bytes live separately
from the workspace credential row — locally in OSS / standalone mode, at the
control plane in managed mode (story 02). See
`docs/design/credentials-oauth-unification.md` "Material provider seam" and
`planning/sprints/credentials-vault/01-material-provider-interface-and-local-impl.md`.

- `@codemation/core`: new `CredentialMaterialProvider` interface +
  `MaterialBundle`, `CredentialMaterialRef`, `CallerContext` types and
  `IllegalMaterialSourceError`. `CredentialInstanceRecord` gains a required
  `material: { source: "local" | "control-plane"; ref: string }` pointer.
- `@codemation/host`: `LocalCredentialMaterialProvider` reads/writes OAuth
  material via the existing `PrismaCredentialStore` and ignores caller context
  (no audit log in standalone mode). Registered unconditionally in DI; story 02
  adds the managed-mode dispatcher.
- Prisma migration adds `material_source` (default `'local'`) and `material_ref`
  columns on `CredentialInstance` for both postgresql and sqlite, backfilling
  existing rows to `{source: "local", ref: instance_id}`. No call sites are
  rewired through the provider yet — that's story 02.
