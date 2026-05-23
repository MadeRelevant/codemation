import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { CredentialSecretCipher } from "../../../src/domain/credentials/CredentialSecretCipher";
import { CredentialKeyRotatedError } from "../../../src/domain/credentials/CredentialKeyRotatedError";
import { makeAppConfig } from "../../testkit/AppConfigFixturesFactory";

/** 32 random bytes encoded as base64 — valid input for v2 HKDF path. */
const KEY_A = Buffer.alloc(32, 0x11).toString("base64"); // deterministic for tests
const KEY_B = Buffer.alloc(32, 0x22).toString("base64");
const PAYLOAD = { accessToken: "tok_abc", userId: "u-1" };

function makeCipher(masterKey: string | undefined): CredentialSecretCipher {
  return new CredentialSecretCipher(makeAppConfig({ env: { CODEMATION_CREDENTIALS_MASTER_KEY: masterKey } }));
}

describe("CredentialSecretCipher", () => {
  it("encrypt → decrypt round-trip preserves payload", () => {
    const cipher = makeCipher(KEY_A);
    const record = cipher.encrypt(PAYLOAD);
    const result = cipher.decrypt(record);
    assert.deepEqual(result, PAYLOAD);
  });

  it("writes schemaVersion 2 for new encryptions", () => {
    const cipher = makeCipher(KEY_A);
    const record = cipher.encrypt(PAYLOAD);
    assert.equal(record.schemaVersion, 2);
  });

  it("tampered ciphertext fails with auth-tag error", () => {
    const cipher = makeCipher(KEY_A);
    const record = cipher.encrypt(PAYLOAD);
    // Flip a byte in the middle of the base64 payload to corrupt the GCM auth tag or ciphertext.
    // eslint-disable-next-line codemation/no-buffer-everything -- test helper; bounded KB-sized test payload
    const raw = Buffer.from(record.encryptedJson, "base64");
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0xff;
    const tampered = { ...record, encryptedJson: raw.toString("base64") };
    // Node.js AES-GCM auth-tag failures surface as "Unsupported state or unable to authenticate data"
    assert.throws(() => cipher.decrypt(tampered), /unable to authenticate data|auth tag/i);
  });

  it("missing CODEMATION_CREDENTIALS_MASTER_KEY throws on encrypt", () => {
    const cipher = makeCipher(undefined);
    assert.throws(() => cipher.encrypt(PAYLOAD), /CODEMATION_CREDENTIALS_MASTER_KEY/);
  });

  it("rejects CODEMATION_CREDENTIALS_MASTER_KEY that does not decode to 32 bytes", () => {
    // 16-byte value — not 32.
    const shortKey = Buffer.alloc(16, 0x01).toString("base64");
    const cipher = makeCipher(shortKey);
    assert.throws(
      () => cipher.encrypt(PAYLOAD),
      /CODEMATION_CREDENTIALS_MASTER_KEY must be a base64-encoded 32-byte value/,
    );
    assert.throws(
      () => cipher.encrypt(PAYLOAD),
      /openssl rand -base64 32/,
      "error message must include the openssl hint",
    );
  });

  it("missing CODEMATION_CREDENTIALS_MASTER_KEY throws on decrypt (not key-rotated)", () => {
    const cipherWithKey = makeCipher(KEY_A);
    const record = cipherWithKey.encrypt(PAYLOAD);
    const cipherNoKey = makeCipher(undefined);
    assert.throws(
      () => cipherNoKey.decrypt(record),
      (err: Error) => {
        // Must be the missing-env error, not CredentialKeyRotatedError
        assert.ok(!(err instanceof CredentialKeyRotatedError), "must not throw CredentialKeyRotatedError");
        assert.match(err.message, /CODEMATION_CREDENTIALS_MASTER_KEY/);
        return true;
      },
    );
  });

  it("two encryptions of the same payload produce different ciphertexts (IV randomness)", () => {
    const cipher = makeCipher(KEY_A);
    const a = cipher.encrypt(PAYLOAD);
    const b = cipher.encrypt(PAYLOAD);
    assert.notEqual(a.encryptedJson, b.encryptedJson);
  });

  it("encryptionKeyId is deterministic for the same master key", () => {
    const cipherA1 = makeCipher(KEY_A);
    const cipherA2 = makeCipher(KEY_A);
    assert.equal(cipherA1.encrypt(PAYLOAD).encryptionKeyId, cipherA2.encrypt(PAYLOAD).encryptionKeyId);
  });

  it("encryptionKeyId differs for different master keys", () => {
    const cipherA = makeCipher(KEY_A);
    const cipherB = makeCipher(KEY_B);
    assert.notEqual(cipherA.encrypt(PAYLOAD).encryptionKeyId, cipherB.encrypt(PAYLOAD).encryptionKeyId);
  });

  it("encryptionKeyId matches first 12 hex chars of sha256(raw key env value)", () => {
    const cipher = makeCipher(KEY_A);
    const record = cipher.encrypt(PAYLOAD);
    const expectedKeyId = createHash("sha256").update(KEY_A).digest("hex").slice(0, 12);
    assert.equal(record.encryptionKeyId, expectedKeyId);
  });

  it("HKDF produces a deterministic key (same env → same derived key material)", () => {
    // Two cipher instances with the same key must encrypt to the same ciphertext
    // when given the same IV — verified indirectly by round-trip decrypt.
    const cipher = makeCipher(KEY_A);
    const record = cipher.encrypt(PAYLOAD);
    // A fresh instance with the same key must be able to decrypt.
    const cipher2 = makeCipher(KEY_A);
    assert.deepEqual(cipher2.decrypt(record), PAYLOAD);
  });

  it("key rotation: encrypt with key A, decrypt with key B throws CredentialKeyRotatedError containing old keyId", () => {
    const cipherA = makeCipher(KEY_A);
    const record = cipherA.encrypt(PAYLOAD);
    const storedKeyId = record.encryptionKeyId;

    const cipherB = makeCipher(KEY_B);
    assert.throws(
      () => cipherB.decrypt(record),
      (err: unknown) => {
        assert.ok(err instanceof CredentialKeyRotatedError, `expected CredentialKeyRotatedError, got ${String(err)}`);
        assert.ok(err.message.includes(storedKeyId), `message must include stored keyId "${storedKeyId}"`);
        assert.equal(err.storedKeyId, storedKeyId);
        return true;
      },
    );
  });

  it("v1 schemaVersion records can still be decrypted (backward-compat migration path)", () => {
    // Simulate a record that was written before the HKDF upgrade (schemaVersion: 1, SHA-256 key).
    // We manually build a valid v1 encrypted record using the SHA-256 approach.
    const rawKey = KEY_A; // base64 string used as-is in v1
    const keyMaterial = createHash("sha256").update(rawKey).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyMaterial, iv);
    const plaintext = Buffer.from(JSON.stringify(PAYLOAD), "utf8");
    // eslint-disable-next-line codemation/no-buffer-everything -- test helper: bounded KB-sized test payload for v1 compat verification
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // eslint-disable-next-line codemation/no-buffer-everything -- test helper: bounded KB-sized test payload for v1 compat verification
    const encryptedJson = Buffer.concat([iv, authTag, encrypted]).toString("base64");
    const encryptionKeyId = createHash("sha256").update(rawKey).digest("hex").slice(0, 12);

    const v1Record = { encryptedJson, encryptionKeyId, schemaVersion: 1 };

    const cipherInstance = makeCipher(KEY_A);
    const result = cipherInstance.decrypt(v1Record);
    assert.deepEqual(result, PAYLOAD, "v1 record must decrypt correctly after HKDF upgrade");
  });
});
