import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CredentialSecretCipher } from "../../../src/domain/credentials/CredentialSecretCipher";
import { CredentialKeyRotatedError } from "../../../src/domain/credentials/CredentialKeyRotatedError";
import { makeAppConfig } from "../../testkit/AppConfigFixturesFactory";

function makeCipher(masterKey: string | undefined): CredentialSecretCipher {
  return new CredentialSecretCipher(makeAppConfig({ env: { CODEMATION_CREDENTIALS_MASTER_KEY: masterKey } }));
}

const KEY_A = "test-master-key-alpha-32-bytes!!";
const KEY_B = "test-master-key-bravo-32-bytes!!";
const PAYLOAD = { accessToken: "tok_abc", userId: "u-1" };

describe("CredentialSecretCipher", () => {
  it("encrypt → decrypt round-trip preserves payload", () => {
    const cipher = makeCipher(KEY_A);
    const record = cipher.encrypt(PAYLOAD);
    const result = cipher.decrypt(record);
    assert.deepEqual(result, PAYLOAD);
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

  it("encryptionKeyId matches first 12 hex chars of sha256(key)", () => {
    const cipher = makeCipher(KEY_A);
    const record = cipher.encrypt(PAYLOAD);
    const expectedKeyId = createHash("sha256").update(KEY_A).digest("hex").slice(0, 12);
    assert.equal(record.encryptionKeyId, expectedKeyId);
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
});
