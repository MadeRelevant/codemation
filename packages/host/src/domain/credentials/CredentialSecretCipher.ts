import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { inject, injectable } from "@codemation/core";

import { ApplicationTokens } from "../../applicationTokens";

import type { JsonRecord } from "./CredentialServices";

@injectable()
export class CredentialSecretCipher {
  private static readonly algorithm = "aes-256-gcm";
  private static readonly schemaVersion = 1;
  private static readonly ivLength = 12;

  constructor(
    @inject(ApplicationTokens.ProcessEnv)
    private readonly env: Readonly<NodeJS.ProcessEnv>,
  ) {}

  encrypt(value: JsonRecord): Readonly<{
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
  }> {
    const iv = randomBytes(CredentialSecretCipher.ivLength);
    const cipher = createCipheriv(CredentialSecretCipher.algorithm, this.resolveKeyMaterial(), iv);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encryptedJson: Buffer.concat([iv, authTag, encrypted]).toString("base64"),
      encryptionKeyId: this.resolveKeyId(),
      schemaVersion: CredentialSecretCipher.schemaVersion,
    };
  }

  decrypt(
    record: Readonly<{
      encryptedJson: string;
      encryptionKeyId: string;
      schemaVersion: number;
    }>,
  ): JsonRecord {
    const packed = Buffer.from(record.encryptedJson, "base64");
    const iv = packed.subarray(0, CredentialSecretCipher.ivLength);
    const authTag = packed.subarray(CredentialSecretCipher.ivLength, CredentialSecretCipher.ivLength + 16);
    const encrypted = packed.subarray(CredentialSecretCipher.ivLength + 16);
    const decipher = createDecipheriv(CredentialSecretCipher.algorithm, this.resolveKeyMaterial(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as JsonRecord;
  }

  private resolveKeyMaterial(): Buffer {
    const rawValue = this.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    if (!rawValue || rawValue.trim().length === 0) {
      throw new Error("CODEMATION_CREDENTIALS_MASTER_KEY is required to encrypt database-managed credentials.");
    }
    return createHash("sha256").update(rawValue).digest();
  }

  private resolveKeyId(): string {
    const rawValue = this.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    return createHash("sha256")
      .update(rawValue ?? "")
      .digest("hex")
      .slice(0, 12);
  }
}
