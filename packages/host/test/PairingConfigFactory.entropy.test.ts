import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { PairingConfigFactory } from "../src/pairing/PairingConfigFactory";

const WORKSPACE_ID = "ws_test";
const CONTROL_PLANE_URL = "https://cp.example.com";

/** Returns a valid 32-byte base64 pairing secret. */
function validSecret(): string {
  return Buffer.alloc(32, 0xab).toString("base64");
}

describe("PairingConfigFactory — pairing secret entropy validation", () => {
  test("returns null when WORKSPACE_PAIRING_SECRET is absent (pairing disabled)", () => {
    const factory = new PairingConfigFactory();
    const result = factory.create({ WORKSPACE_ID, CONTROL_PLANE_URL });
    assert.equal(result, null);
  });

  test("returns null when any required var is absent", () => {
    const factory = new PairingConfigFactory();
    assert.equal(factory.create({ WORKSPACE_PAIRING_SECRET: validSecret(), CONTROL_PLANE_URL }), null);
    assert.equal(factory.create({ WORKSPACE_ID, WORKSPACE_PAIRING_SECRET: validSecret() }), null);
  });

  test("throws at boot when WORKSPACE_PAIRING_SECRET is present but not 32-byte base64", () => {
    const factory = new PairingConfigFactory();
    const shortSecret = Buffer.alloc(16, 1).toString("base64"); // only 16 bytes

    assert.throws(
      () => factory.create({ WORKSPACE_ID, WORKSPACE_PAIRING_SECRET: shortSecret, CONTROL_PLANE_URL }),
      /WORKSPACE_PAIRING_SECRET must be a base64-encoded 32-byte value/,
      "should throw for < 32-byte secret",
    );
  });

  test("thrown error includes openssl rand hint", () => {
    const factory = new PairingConfigFactory();
    const badSecret = "tooshort";

    try {
      factory.create({ WORKSPACE_ID, WORKSPACE_PAIRING_SECRET: badSecret, CONTROL_PLANE_URL });
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.match(e.message, /openssl rand -base64 32/, "error message must include the openssl hint");
    }
  });

  test("throws for > 32-byte decoded secret", () => {
    const factory = new PairingConfigFactory();
    const longSecret = Buffer.alloc(48, 0x01).toString("base64"); // 48 bytes

    assert.throws(
      () => factory.create({ WORKSPACE_ID, WORKSPACE_PAIRING_SECRET: longSecret, CONTROL_PLANE_URL }),
      /WORKSPACE_PAIRING_SECRET must be a base64-encoded 32-byte value/,
    );
  });

  test("returns valid PairingConfig when all env vars are present and valid", () => {
    const factory = new PairingConfigFactory();
    const secret = validSecret();

    const result = factory.create({ WORKSPACE_ID, WORKSPACE_PAIRING_SECRET: secret, CONTROL_PLANE_URL });

    assert.ok(result !== null);
    assert.equal(result.workspaceId, WORKSPACE_ID);
    assert.equal(result.pairingSecret, secret);
    assert.equal(result.controlPlaneUrl, CONTROL_PLANE_URL);
  });
});
