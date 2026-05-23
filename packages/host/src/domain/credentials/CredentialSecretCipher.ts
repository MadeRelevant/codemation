import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

import { inject, injectable } from "@codemation/core";

import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";

import type { JsonRecord } from "./CredentialServices";
import { CredentialKeyRotatedError } from "./CredentialKeyRotatedError";

/**
 * Schema versions:
 *   1 — key = SHA-256(rawValue)                  (legacy, read-only support retained for migration)
 *   2 — key = HKDF-SHA-256(rawKey32Bytes, ...)   (current)
 *
 * All new encryptions are written as v2. Existing v1 records can still be
 * decrypted so operators can re-encrypt at their own pace (re-bind the
 * credential in the UI, or run the one-shot re-encrypt script).
 */
@injectable()
export class CredentialSecretCipher {
  private static readonly algorithm = "aes-256-gcm";
  private static readonly currentSchemaVersion = 2;
  private static readonly ivLength = 12;

  private static readonly HKDF_SALT = "codemation/credential-cipher/v1";
  private static readonly HKDF_INFO = "aes-256-gcm-key";

  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
  ) {}

  encrypt(value: JsonRecord): Readonly<{
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
  }> {
    const iv = randomBytes(CredentialSecretCipher.ivLength);
    const cipher = createCipheriv(CredentialSecretCipher.algorithm, this.resolveKeyMaterialV2(), iv);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    // eslint-disable-next-line codemation/no-buffer-everything -- AES-GCM credential cipher operates on bounded KB-sized JSON payloads; streaming crypto is not applicable here.
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      // eslint-disable-next-line codemation/no-buffer-everything -- AES-GCM credential cipher operates on bounded KB-sized JSON payloads; streaming crypto is not applicable here.
      encryptedJson: Buffer.concat([iv, authTag, encrypted]).toString("base64"),
      encryptionKeyId: this.resolveKeyId(),
      schemaVersion: CredentialSecretCipher.currentSchemaVersion,
    };
  }

  decrypt(
    record: Readonly<{
      encryptedJson: string;
      encryptionKeyId: string;
      schemaVersion: number;
    }>,
  ): JsonRecord {
    // resolveKeyMaterialV2 / resolveKeyMaterialV1 both throw if env is missing
    // — that check must come before the key-id comparison.
    const keyMaterial = (record.schemaVersion ?? 1) >= 2 ? this.resolveKeyMaterialV2() : this.resolveKeyMaterialV1();

    const currentKeyId = this.resolveKeyId();
    if (record.encryptionKeyId !== currentKeyId) {
      throw new CredentialKeyRotatedError(record.encryptionKeyId);
    }
    // eslint-disable-next-line codemation/no-buffer-everything -- AES-GCM credential cipher operates on bounded KB-sized JSON payloads; streaming crypto is not applicable here.
    const packed = Buffer.from(record.encryptedJson, "base64");
    const iv = packed.subarray(0, CredentialSecretCipher.ivLength);
    const authTag = packed.subarray(CredentialSecretCipher.ivLength, CredentialSecretCipher.ivLength + 16);
    const encrypted = packed.subarray(CredentialSecretCipher.ivLength + 16);
    const decipher = createDecipheriv(CredentialSecretCipher.algorithm, keyMaterial, iv);
    decipher.setAuthTag(authTag);
    // eslint-disable-next-line codemation/no-buffer-everything -- AES-GCM credential cipher operates on bounded KB-sized JSON payloads; streaming crypto is not applicable here.
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as JsonRecord;
  }

  /**
   * Current (v2) key derivation: HKDF-SHA-256 with a fixed application salt and info label.
   * Input must be a base64-encoded 32-byte value (`CODEMATION_CREDENTIALS_MASTER_KEY`).
   */
  private resolveKeyMaterialV2(): Buffer {
    const ikm = this.resolveBase64Key32Bytes();
    return Buffer.from(
      hkdfSync(
        "sha256",
        ikm,
        Buffer.from(CredentialSecretCipher.HKDF_SALT, "utf8"),
        Buffer.from(CredentialSecretCipher.HKDF_INFO, "utf8"),
        32,
      ),
    );
  }

  /**
   * Legacy (v1) key derivation: SHA-256 of the raw env string.
   * Retained for decrypt-side backward compatibility only.
   */
  private resolveKeyMaterialV1(): Buffer {
    const rawValue = this.appConfig.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    if (!rawValue || rawValue.trim().length === 0) {
      throw new Error("CODEMATION_CREDENTIALS_MASTER_KEY is required to encrypt database-managed credentials.");
    }
    return createHash("sha256").update(rawValue).digest();
  }

  /**
   * Validates and returns the raw 32-byte key material from the env var.
   * Throws if the env var is absent or does not decode to exactly 32 bytes.
   */
  private resolveBase64Key32Bytes(): Buffer {
    const rawValue = this.appConfig.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    if (!rawValue || rawValue.trim().length === 0) {
      throw new Error("CODEMATION_CREDENTIALS_MASTER_KEY is required to encrypt database-managed credentials.");
    }
    // eslint-disable-next-line codemation/no-buffer-everything -- key material is always 32 bytes; bounded by validation below.
    const decoded = Buffer.from(rawValue.trim(), "base64");
    if (decoded.length !== 32) {
      throw new Error(
        `CODEMATION_CREDENTIALS_MASTER_KEY must be a base64-encoded 32-byte value (got ${decoded.length} bytes). ` +
          `Generate a valid key with: openssl rand -base64 32`,
      );
    }
    return decoded;
  }

  private resolveKeyId(): string {
    const rawValue = this.appConfig.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    return createHash("sha256")
      .update(rawValue ?? "")
      .digest("hex")
      .slice(0, 12);
  }
}
