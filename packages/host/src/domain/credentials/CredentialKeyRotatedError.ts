/**
 * Thrown by {@link CredentialSecretCipher.decrypt} when the credential's stored
 * `encryptionKeyId` does not match the current master key's id.
 *
 * This indicates the `CODEMATION_CREDENTIALS_MASTER_KEY` environment variable has
 * been rotated since the credential was encrypted. The operator must re-bind the
 * affected credential (which re-encrypts it with the new key).
 *
 * See {@link docs/security-boundary.md} for the key rotation contract.
 */
export class CredentialKeyRotatedError extends Error {
  readonly storedKeyId: string;

  constructor(storedKeyId: string) {
    super(
      `Credential was encrypted with key "${storedKeyId}" but the current master key produces a different id. ` +
        `Re-bind the credential to re-encrypt it with the active key.`,
    );
    this.name = "CredentialKeyRotatedError";
    this.storedKeyId = storedKeyId;
  }
}
