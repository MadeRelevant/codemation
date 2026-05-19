---
"@codemation/core-nodes": minor
"@codemation/host": minor
---

fix(security): engine activation budget + retry ceiling + SSRF allowlist + HKDF cipher + pairing entropy (Sprint 14 Story 09)

**Engine / retry fixes (already implemented in Sprint 13/14 — tests added here):**

- `RunContinuationService` uses `EngineExecutionLimitsPolicy.defaultMaxNodeActivations` (100,000) as the fallback, not `Number.MAX_SAFE_INTEGER`.
- `InProcessRetryRunner` enforces a hard ceiling of 10 retry attempts via `HARD_MAX_RETRY_ATTEMPTS`; workflow-declared values above this are clamped with a warning log.

**SSRF allowlist (`@codemation/core-nodes`):**

- New `SsrfGuard` class DNS-resolves the target host before any outbound HTTP call and throws `SSRFBlockedError` if any resolved address falls in RFC-1918 (10/8, 172.16/12, 192.168/16), link-local (169.254/16), or loopback (127/8, ::1) ranges.
- `HttpRequestExecutor` now accepts `SsrfGuard` as an injected collaborator (4th constructor arg). All composition roots updated.
- `HttpRequestSpec.allowPrivateNetworkTargets` opt-in flag allows trusted workflows to bypass SSRF protection.
- New `SSRFBlockedError` class with `resolvedIp` field for structured error handling.

**HKDF cipher key derivation (`@codemation/host`) — BACKWARDS-INCOMPATIBLE:**

- `CredentialSecretCipher` switches from raw SHA-256 to HKDF-SHA-256 for AES key derivation.
  - HKDF salt: `"codemation/credential-cipher/v1"`, info: `"aes-256-gcm-key"`.
  - Input (`CODEMATION_CREDENTIALS_MASTER_KEY`) must now be a base64-encoded 32-byte value.
- New `schemaVersion: 2` for all new encryptions. Existing `schemaVersion: 1` records can still be decrypted (v1 SHA-256 read-path retained for migration).
- **Migration**: Re-bind affected credentials in the UI (which re-encrypts with the new HKDF key).
- See migration guide below.

**Pairing secret entropy validation (`@codemation/host`):**

- `PairingConfigFactory` now throws at boot when `WORKSPACE_PAIRING_SECRET` is present but does not decode to exactly 32 bytes from base64.
- Error message includes `openssl rand -base64 32` hint for generating a valid secret.

---

### Migration guide — CODEMATION_CREDENTIALS_MASTER_KEY

**Who is affected:** Any deployment that has `CODEMATION_CREDENTIALS_MASTER_KEY` set and has encrypted credentials stored in the database.

**What changed:** The key derivation function changed from `SHA-256(rawString)` to `HKDF-SHA-256(base64Decode(rawString), salt, info)`. The input key must now be exactly 32 bytes when base64-decoded.

**Migration steps:**

1. Generate a new 32-byte key: `openssl rand -base64 32`
2. Set `CODEMATION_CREDENTIALS_MASTER_KEY` to this new value.
3. Re-bind each credential in the Codemation UI (open the credential, re-enter secrets, save). This re-encrypts with the new HKDF-derived key at `schemaVersion: 2`.
4. Credentials not yet re-bound will throw `CredentialKeyRotatedError` when accessed — the existing key-rotation error handling applies.

**Rollback:** Keep the old key value in a safe location. To roll back, restore the old `CODEMATION_CREDENTIALS_MASTER_KEY` value — the v1 SHA-256 decrypt path is retained in this release.
