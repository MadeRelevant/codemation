import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { IncomingHmacVerifier } from "../../src/pairing/IncomingHmacVerifier";
import type { PairingConfig } from "../../src/pairing/pairing.types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "ws-unit-test";
// Valid base64-encoded 32-byte pairing secret
const PAIRING_SECRET_BASE64 = randomBytes(32).toString("base64");

const DEFAULT_CONFIG: PairingConfig = {
  workspaceId: WORKSPACE_ID,
  pairingSecret: PAIRING_SECRET_BASE64,
  controlPlaneUrl: "https://cp.test",
};

function makeVerifier(config: PairingConfig = DEFAULT_CONFIG): IncomingHmacVerifier {
  return new IncomingHmacVerifier(config);
}

interface SignOptions {
  workspaceId?: string;
  secret?: string;
  tsOffset?: number;
  nonce?: string;
  method?: string;
  url?: string;
  body?: string;
}

function signRequest(opts: SignOptions = {}): string {
  const method = (opts.method ?? "GET").toUpperCase();
  const url = opts.url ?? "/internal/ping";
  const body = opts.body ?? "";
  const secret = opts.secret ?? PAIRING_SECRET_BASE64;
  const workspaceId = opts.workspaceId ?? WORKSPACE_ID;
  // eslint-disable-next-line no-restricted-properties -- HMAC sign helper must use wall-clock time; timestamp skew validation requires real now
  const ts = Math.floor(Date.now() / 1000) + (opts.tsOffset ?? 0);
  const nonce = opts.nonce ?? randomBytes(16).toString("base64");

  const parsed = new URL(url, "http://placeholder");
  const path = (parsed.pathname + parsed.search).toLowerCase();
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const baseString = [method, path, ts, nonce, bodyHash].join("\n");
  // eslint-disable-next-line codemation/no-buffer-everything -- test helper, bounded secret
  const secretBytes = Buffer.from(secret, "base64");
  const sig = createHmac("sha256", secretBytes).update(baseString, "utf8").digest("base64");

  return `Codemation-Hmac v=1,workspaceId=${workspaceId},ts=${ts},nonce=${nonce},sig=${sig}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("IncomingHmacVerifier", () => {
  it("valid signature passes and returns workspaceId", () => {
    const verifier = makeVerifier();
    const header = signRequest();
    const result = verifier.verify("GET", "/internal/ping", "", header);
    assert.ok(!("failure" in result), `expected success, got failure: ${JSON.stringify(result)}`);
    assert.equal(result.workspaceId, WORKSPACE_ID);
  });

  it("wrong workspaceId in header fails with workspace failure", () => {
    const verifier = makeVerifier();
    // Sign with a different workspaceId (but same secret so sig is valid for that id).
    const header = signRequest({ workspaceId: "ws-other" });
    const result = verifier.verify("GET", "/internal/ping", "", header);
    assert.ok("failure" in result);
    assert.equal(result.failure, "workspace");
  });

  it("tampered body fails with signature failure (constant-time equality used)", () => {
    const verifier = makeVerifier();
    // Sign with empty body but verify with non-empty body.
    const header = signRequest({ body: "" });
    const result = verifier.verify("GET", "/internal/ping", "tampered-body", header);
    assert.ok("failure" in result);
    assert.equal(result.failure, "signature");
  });

  it("tampered Authorization header fails with signature failure", () => {
    const verifier = makeVerifier();
    const header = signRequest();
    // Flip the last char of the sig value.
    const tampered = header.slice(0, -1) + (header.endsWith("A") ? "B" : "A");
    const result = verifier.verify("GET", "/internal/ping", "", tampered);
    assert.ok("failure" in result);
    assert.equal(result.failure, "signature");
  });

  it("skewed timestamp (>5 min in the past) fails with expired failure", () => {
    const verifier = makeVerifier();
    const header = signRequest({ tsOffset: -(5 * 60 + 1) }); // 301 seconds ago
    const result = verifier.verify("GET", "/internal/ping", "", header);
    assert.ok("failure" in result);
    assert.equal(result.failure, "expired");
  });

  it("missing pairing secret throws an explicit error (not a silent signature mismatch)", () => {
    const configNoPairingSecret: PairingConfig = {
      workspaceId: WORKSPACE_ID,
      pairingSecret: "", // empty — must throw, not silently fail with signature mismatch
      controlPlaneUrl: "https://cp.test",
    };
    const verifier = makeVerifier(configNoPairingSecret);
    const header = signRequest();
    // Must throw, not return { failure: "signature" } — silent failure is the exploit condition.
    assert.throws(() => verifier.verify("GET", "/internal/ping", "", header), /pairingSecret/i);
  });

  it("replayed nonce within window fails with replay failure", () => {
    const verifier = makeVerifier();
    const nonce = randomBytes(16).toString("base64");
    const header = signRequest({ nonce });

    const first = verifier.verify("GET", "/internal/ping", "", header);
    assert.ok(!("failure" in first), "first request should succeed");

    // Replay the exact same signed request.
    const second = verifier.verify("GET", "/internal/ping", "", header);
    assert.ok("failure" in second);
    assert.equal(second.failure, "replay");
  });

  it("nonce replay protection is per-instance and does NOT survive verifier recreation", () => {
    const nonce = randomBytes(16).toString("base64");
    const header = signRequest({ nonce });

    const verifier1 = makeVerifier();
    const first = verifier1.verify("GET", "/internal/ping", "", header);
    assert.ok(!("failure" in first), "first verifier: request should pass");

    // Same nonce, same header — second call on SAME instance must fail.
    const replay = verifier1.verify("GET", "/internal/ping", "", header);
    assert.ok("failure" in replay, "same instance: replay must be rejected");
    assert.equal(replay.failure, "replay");

    // A freshly created verifier has no nonce cache — the same nonce is accepted again.
    // This documents the in-memory, per-process limitation: restart resets protection.
    const verifier2 = makeVerifier();
    const afterRecreation = verifier2.verify("GET", "/internal/ping", "", header);
    assert.ok(
      !("failure" in afterRecreation),
      "new verifier instance has no memory of previous nonces — replay succeeds (expected per-process limitation)",
    );
  });
});
