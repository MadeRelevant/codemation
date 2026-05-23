---
"@codemation/host": patch
---

feat(host/security): HMAC verifier + credential cipher trust-boundary tests and `CredentialKeyRotatedError` for key rotation (Sprint 13 Story E framework-side).

- New `CredentialKeyRotatedError` thrown by `CredentialSecretCipher.decrypt` when the stored `encryptionKeyId` does not match the active master key — explicit fail-loud on key rotation.
- `CredentialSecretCipher` updated: decrypt now checks key id before attempting decryption, with missing-env → key-id-mismatch → auth-tag-failure ordering.
- `IncomingHmacVerifier` now throws explicitly when `pairingSecret` is empty (prevents silent signature-mismatch on misconfiguration).
- 8 unit tests for `IncomingHmacVerifier` (valid/wrong-workspace/tampered-body/tampered-header/skewed-timestamp/missing-secret-throws/replay/nonce-per-instance).
- 4 integration tests for `InternalHmacAuthMiddleware` hitting `/internal/ping` (valid 200/tampered 401/wrong-workspace 401/replay 401).
- 7 unit tests for `CredentialSecretCipher` (round-trip/tamper/missing-env-encrypt/missing-env-decrypt/IV-randomness/keyId-format/key-rotation-throws-CredentialKeyRotatedError).
- Fix pre-existing TS error: `ManagedAuthTestJwks` `KeyLike` → `CryptoKey` (jose v6 dropped the alias).
- New `docs/security-boundary.md` documenting HMAC trust boundary, in-memory nonce cache semantics, and cipher key rotation contract.
