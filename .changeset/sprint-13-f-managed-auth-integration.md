---
"@codemation/host": patch
---

Add integration test coverage for managed-auth pipeline (Sprint 13 Story F).

- `managedAuth.integration.test.ts`: 5 new `/api/me` end-to-end cases (happy path, anonymous, tampered, expired, wrong audience) using a real signed JWT.
- `managedAuthSqlite.integration.test.ts`: boot regression guard for `auth.kind: "managed"` + sqlite combination (commit 35b8732c fix).
- `ManagedAuthTestJwks` testkit: reusable test EdDSA keypair + JWKS server helper.
