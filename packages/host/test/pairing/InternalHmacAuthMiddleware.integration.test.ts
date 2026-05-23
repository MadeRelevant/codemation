// @vitest-environment node

import path from "node:path";
import { randomBytes, createHmac, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { FrontendHttpIntegrationHarness } from "../http/testkit/FrontendHttpIntegrationHarness";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import type { PairingConfig } from "../../src/pairing/pairing.types";
import { HmacRequestSigner } from "../../src/pairing/HmacRequestSigner";

// ── Pairing fixture ────────────────────────────────────────────────────────────

const WORKSPACE_ID = "ws-hmac-integration-test";
// 32 random bytes encoded as base64 — valid pairing secret format
const PAIRING_SECRET = randomBytes(32).toString("base64");

const PAIRING_CONFIG: PairingConfig = {
  workspaceId: WORKSPACE_ID,
  pairingSecret: PAIRING_SECRET,
  controlPlaneUrl: "https://cp.hmac.integration.test",
};

// workflowDiscovery.directories must be non-empty for managed mode (normalizer invariant).
// The test directory has no workflow files — an empty discovery list is intentional here.
const MANAGED_CONFIG: CodemationConfig = {
  runtime: {
    eventBus: { kind: "memory" },
    scheduler: { kind: "local" },
  },
  auth: { kind: "managed" },
  workflowDiscovery: { directories: [import.meta.dirname] },
};

async function createHarness(): Promise<FrontendHttpIntegrationHarness> {
  const harness = new FrontendHttpIntegrationHarness({
    config: MANAGED_CONFIG,
    consumerRoot: path.resolve(import.meta.dirname, "../.."),
    env: {
      WORKSPACE_ID,
      WORKSPACE_PAIRING_SECRET: PAIRING_SECRET,
      CONTROL_PLANE_URL: "https://cp.hmac.integration.test",
      // JWT auth for managed mode — not under test here but required by the harness
      CONTROL_PLANE_JWKS_URL: "https://cp.hmac.integration.test/.well-known/jwks.json",
      CONTROL_PLANE_ISSUER: "https://cp.hmac.integration.test",
      CP_WEB_ORIGIN: "https://app.cp.hmac.integration.test",
    },
  });
  await harness.start();
  return harness;
}

/** Signs a GET /internal/ping request with the configured pairing secret. */
function signPing(config: PairingConfig): string {
  const signer = new HmacRequestSigner(config);
  return signer.sign("GET", "/internal/ping", "").Authorization;
}

/** Produce a signed Authorization header with a fixed nonce for replay testing. */
function signWithNonce(config: PairingConfig, nonce: string): string {
  // eslint-disable-next-line no-restricted-properties -- integration sign helper must use wall-clock time; timestamp validation requires real now
  const ts = Math.floor(Date.now() / 1000);
  const urlPath = "/internal/ping";
  const bodyHash = createHash("sha256").update("", "utf8").digest("hex");
  const baseString = ["GET", urlPath, ts, nonce, bodyHash].join("\n");
  // eslint-disable-next-line codemation/no-buffer-everything -- test helper, bounded pairing secret
  const secretBytes = Buffer.from(config.pairingSecret, "base64");
  const sig = createHmac("sha256", secretBytes).update(baseString, "utf8").digest("base64");
  return `Codemation-Hmac v=1,workspaceId=${config.workspaceId},ts=${ts},nonce=${nonce},sig=${sig}`;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("InternalHmacAuthMiddleware — /internal/ping integration", () => {
  let harness: FrontendHttpIntegrationHarness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("valid HMAC-signed request returns 200 with pong payload", async () => {
    const authorization = signPing(PAIRING_CONFIG);
    const response = await harness.request({
      method: "GET",
      url: "/internal/ping",
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ pong: boolean; workspaceId: string }>();
    expect(body.pong).toBe(true);
    expect(body.workspaceId).toBe(WORKSPACE_ID);
  });

  it("tampered Authorization header returns 401", async () => {
    const authorization = signPing(PAIRING_CONFIG);
    // Flip the last character of the sig to corrupt the signature.
    const tampered = authorization.slice(0, -1) + (authorization.endsWith("A") ? "B" : "A");
    const response = await harness.request({
      method: "GET",
      url: "/internal/ping",
      headers: { authorization: tampered },
    });
    expect(response.statusCode).toBe(401);
  });

  it("wrong workspaceId in header returns 401", async () => {
    const wrongWorkspaceConfig: PairingConfig = {
      ...PAIRING_CONFIG,
      workspaceId: "ws-wrong-workspace",
    };
    const authorization = signPing(wrongWorkspaceConfig);
    const response = await harness.request({
      method: "GET",
      url: "/internal/ping",
      headers: { authorization },
    });
    expect(response.statusCode).toBe(401);
  });

  it("replayed nonce within window returns 401 on second request", async () => {
    const nonce = randomBytes(16).toString("base64");
    const authorization = signWithNonce(PAIRING_CONFIG, nonce);

    // First request — should succeed.
    const first = await harness.request({
      method: "GET",
      url: "/internal/ping",
      headers: { authorization },
    });
    expect(first.statusCode).toBe(200);

    // Replay the exact same signed request — should be rejected.
    const second = await harness.request({
      method: "GET",
      url: "/internal/ping",
      headers: { authorization },
    });
    expect(second.statusCode).toBe(401);
  });
});
