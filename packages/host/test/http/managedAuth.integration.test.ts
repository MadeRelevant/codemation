// @vitest-environment node

import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";

// --- Key material (generated once per test suite run) ---

interface TestKeyPair {
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  publicKey: Awaited<ReturnType<typeof generateKeyPair>>["publicKey"];
  kid: string;
}

// Fixed calendar exp/nbf so we never use Date.now() in tests
const EXP_FUTURE_UNIX = Math.floor(new Date("2099-12-31T00:00:00Z").getTime() / 1000);
const NBF_PAST_UNIX = Math.floor(new Date("2000-01-01T00:00:00Z").getTime() / 1000);

// --- Fake JWKS server ---

class FakeJwksServer {
  private server: http.Server | null = null;
  private port = 0;

  async start(jwks: { keys: unknown[] }): Promise<void> {
    const json = JSON.stringify(jwks);
    this.server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(json);
    });
    this.port = await new Promise<number>((resolve, reject) => {
      this.server!.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to get server address"));
          return;
        }
        resolve(addr.port);
      });
      this.server!.once("error", reject);
    });
  }

  jwksUrl(): string {
    return `http://127.0.0.1:${this.port}/.well-known/jwks.json`;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }
}

// --- Harness factory ---

const WORKSPACE_ID = "ws-integration-test";
const ISSUER = "https://cp.integration.test";
const CP_WEB_ORIGIN = "https://app.cp.integration.test";

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

async function createHarness(jwksUrl: string): Promise<FrontendHttpIntegrationHarness> {
  const harness = new FrontendHttpIntegrationHarness({
    config: MANAGED_CONFIG,
    consumerRoot: path.resolve(import.meta.dirname, "../.."),
    env: {
      WORKSPACE_ID,
      WORKSPACE_PAIRING_SECRET: "Y29kZW1hdGlvbi1tYW5hZ2VkLWF1dGgtdGVzdC0zMmI=",
      CONTROL_PLANE_URL: "https://cp.integration.test",
      CONTROL_PLANE_JWKS_URL: jwksUrl,
      CONTROL_PLANE_ISSUER: ISSUER,
      CP_WEB_ORIGIN,
    },
  });
  await harness.start();
  return harness;
}

async function signToken(
  kp: TestKeyPair,
  overrides: Partial<{ aud: string; iss: string; exp: number }> = {},
): Promise<string> {
  return new SignJWT({ sub: "user-42" })
    .setProtectedHeader({ alg: "EdDSA", kid: kp.kid })
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? WORKSPACE_ID)
    .setExpirationTime(overrides.exp ?? EXP_FUTURE_UNIX)
    .setNotBefore(NBF_PAST_UNIX)
    .sign(kp.privateKey);
}

// --- Tests ---

describe("managed auth mode integration", () => {
  let kp: TestKeyPair;
  let jwksServer: FakeJwksServer;
  let harness: FrontendHttpIntegrationHarness;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("EdDSA");
    const pub = await exportJWK(publicKey);
    kp = { privateKey, publicKey, kid: "integration-key-1" };

    jwksServer = new FakeJwksServer();
    await jwksServer.start({
      keys: [{ ...pub, kid: kp.kid, use: "sig", alg: "EdDSA" }],
    });

    harness = await createHarness(jwksServer.jwksUrl());
  });

  afterAll(async () => {
    await harness.close();
    await jwksServer.stop();
  });

  it("accepts a valid CP-signed bearer on a protected route", async () => {
    const token = await signToken(kp);
    // Use the workflow list endpoint as a canary protected route
    const response = await harness.request({
      method: "GET",
      url: `${ApiPaths.workflows()}`,
      headers: { authorization: `Bearer ${token}` },
    });
    // Should NOT be 401 (might be 200 or 404 — just not unauthorized)
    expect(response.statusCode).not.toBe(401);
  });

  it("returns 401 for an anonymous request (no Authorization header)", async () => {
    const response = await harness.request({
      method: "GET",
      url: `${ApiPaths.workflows()}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for /api/auth/* routes (Better Auth is not mounted)", async () => {
    const response = await harness.request({
      method: "GET",
      url: "/api/auth/session",
    });
    // In managed mode, the auth registrar is not mounted — should be 404 not 200/401
    expect(response.statusCode).toBe(404);
  });

  it("refuses CORS preflight from an origin not equal to CP_WEB_ORIGIN", async () => {
    const response = await harness.requestWithBody(ApiPaths.workflows(), {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "GET",
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows CORS preflight from the configured CP_WEB_ORIGIN", async () => {
    const response = await harness.requestWithBody(ApiPaths.workflows(), {
      method: "OPTIONS",
      headers: {
        origin: CP_WEB_ORIGIN,
        "access-control-request-method": "GET",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.header("access-control-allow-origin")).toBe(CP_WEB_ORIGIN);
  });

  it("returns 401 for a bearer with wrong aud", async () => {
    const token = await signToken(kp, { aud: "ws-wrong-workspace" });
    const response = await harness.request({
      method: "GET",
      url: `${ApiPaths.workflows()}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 401 for an expired bearer", async () => {
    const EXP_PAST_UNIX = Math.floor(new Date("2000-01-01T00:00:00Z").getTime() / 1000);
    const token = await signToken(kp, { exp: EXP_PAST_UNIX });
    const response = await harness.request({
      method: "GET",
      url: `${ApiPaths.workflows()}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 401 for a tampered bearer", async () => {
    const token = await signToken(kp);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}X.${parts[2]}`;
    const response = await harness.request({
      method: "GET",
      url: `${ApiPaths.workflows()}`,
      headers: { authorization: `Bearer ${tampered}` },
    });
    expect(response.statusCode).toBe(401);
  });

  // --- /api/me endpoint cases (Sprint 13 Story F) ---

  it("/api/me happy path: signed JWT returns 200 with { userId, workspaceId }", async () => {
    const token = await signToken(kp);
    const response = await harness.request({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ userId: string; workspaceId: string }>();
    expect(body).toMatchObject({ userId: "user-42", workspaceId: WORKSPACE_ID });
  });

  it("/api/me anonymous: no bearer returns 401", async () => {
    const response = await harness.request({
      method: "GET",
      url: "/api/me",
    });
    expect(response.statusCode).toBe(401);
  });

  it("/api/me tampered: signed-then-edited JWT returns 401", async () => {
    const token = await signToken(kp);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}X.${parts[2]}`;
    const response = await harness.request({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${tampered}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("/api/me expired: expired JWT returns 401", async () => {
    const EXP_PAST_UNIX = Math.floor(new Date("2000-01-01T00:00:00Z").getTime() / 1000);
    const token = await signToken(kp, { exp: EXP_PAST_UNIX });
    const response = await harness.request({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("/api/me wrong audience: valid JWT with wrong aud returns 401", async () => {
    const token = await signToken(kp, { aud: "ws-wrong-workspace" });
    const response = await harness.request({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });
});
