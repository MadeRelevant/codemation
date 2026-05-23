---
"@codemation/host": patch
"create-codemation": patch
---

Allow SQLite in managed mode. The Sprint 3 Story 6 normalizer rule that
forced PostgreSQL when `auth.kind === "managed"` is removed for now —
the provisioner doesn't inject `DATABASE_URL` into spawned workspaces,
so the constraint blocked local provisioning. The managed scaffold
template now defaults to a per-workspace SQLite file.
