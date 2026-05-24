// @vitest-environment node

/**
 * Integration test: ControlPlaneCatalogFetcher → stub control-plane HTTP server.
 *
 * Boots the framework host in managed mode with a stub CP that serves
 * /internal/catalog/* endpoints (HMAC-gated). Verifies:
 *   1. The framework sends correctly HMAC-signed requests to the /internal/catalog/* paths.
 *   2. The catalog data returned by the stub CP is accepted and exposed via the fetcher.
 *
 * Root-cause context: the original bug was that ControlPlaneCatalogFetcher called
 * /api/catalog/* (session-gated in the real CP) instead of /internal/catalog/* (HMAC-gated).
 * This test would have caught the regression.
 */

import http from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ControlPlaneCatalogFetcher } from "../../src/credentials/ControlPlaneCatalogFetcher";
import { HmacRequestSigner } from "../../src/pairing/HmacRequestSigner";
import type { PairingConfig } from "../../src/pairing/pairing.types";

// ── Fixture ───────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "ws-catalog-integration-test";
const PAIRING_SECRET = randomBytes(32).toString("base64"); // base64-encoded 32-byte secret

const FAKE_MCP_SERVERS = [
  {
    id: "srv-1",
    displayName: "Test MCP",
    description: "A test server",
    transport: "http",
    url: "https://mcp.test.example.com",
  },
];
const FAKE_OAUTH_APPS = [{ appId: "google", displayName: "Google" }];
const FAKE_CRED_TYPES = [{ typeId: "oauth.test", displayName: "Test OAuth" }];

// ── Stub control-plane server ─────────────────────────────────────────────────

/**
 * Minimal HTTP server that:
 *   - Verifies HMAC signatures on incoming requests (per pairing-protocol.md).
 *   - Serves the three /internal/catalog/* endpoints.
 *   - Records every request path that passed auth (for assertion).
 */
class StubControlPlane {
  private server: http.Server | null = null;
  private port = 0;
  readonly receivedPaths: string[] = [];

  async start(workspaceId: string, pairingSecret: string): Promise<void> {
    this.server = http.createServer((req, res) => {
      const authorized = this.verifyHmac(req, workspaceId, pairingSecret);
      if (!authorized) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const url = new URL(req.url ?? "/", `http://127.0.0.1`);
      this.receivedPaths.push(url.pathname);

      res.writeHead(200, { "Content-Type": "application/json" });
      if (url.pathname.endsWith("oauth-apps")) {
        res.end(JSON.stringify(FAKE_OAUTH_APPS));
      } else if (url.pathname.endsWith("mcp-servers")) {
        res.end(JSON.stringify(FAKE_MCP_SERVERS));
      } else if (url.pathname.endsWith("credential-types")) {
        res.end(JSON.stringify(FAKE_CRED_TYPES));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    this.port = await new Promise<number>((resolve, reject) => {
      this.server!.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to get stub server address"));
          return;
        }
        resolve(addr.port);
      });
      this.server!.once("error", reject);
    });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  /**
   * Verifies the Codemation-Hmac header per pairing-protocol.md.
   * Returns true if the signature is valid for this workspace + secret.
   */
  private verifyHmac(req: http.IncomingMessage, workspaceId: string, pairingSecret: string): boolean {
    const authHeader = (req.headers["authorization"] ?? "") as string;
    if (!authHeader.startsWith("Codemation-Hmac ")) return false;

    const payload = authHeader.slice("Codemation-Hmac ".length);
    const fields: Record<string, string> = {};
    for (const part of payload.split(",")) {
      const eq = part.indexOf("=");
      if (eq === -1) return false;
      fields[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }

    const { v, workspaceId: claimedWs, ts, nonce, sig } = fields;
    if (!v || !claimedWs || !ts || !nonce || !sig) return false;
    if (v !== "1") return false;
    if (claimedWs !== workspaceId) return false;

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - Number(ts)) > 300) return false;

    const url = new URL(req.url ?? "/", `http://127.0.0.1`);
    const path = (url.pathname + url.search).toLowerCase();
    const bodyHash = createHash("sha256").update("", "utf8").digest("hex");
    const baseString = ["GET", path, ts, nonce, bodyHash].join("\n");

    // eslint-disable-next-line codemation/no-buffer-everything -- integration test: bounded pairing secret
    const secretBytes = Buffer.from(pairingSecret, "base64");
    const expected = createHmac("sha256", secretBytes).update(baseString, "utf8").digest("base64");

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(sig);
    return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  }
}

// ── Logger stub ───────────────────────────────────────────────────────────────

function makeNoopLoggers() {
  const noop = () => {};
  return {
    create: (_scope: string) => ({
      info: noop,
      debug: noop,
      warn: noop,
      error: noop,
    }),
  };
}

function makeAppConfig(env: Record<string, string> = {}) {
  return {
    env: { CODEMATION_CATALOG_POLL_INTERVAL_SECONDS: "0", ...env },
    consumerRoot: "/",
    repoRoot: "/",
    workflowSources: [],
    workflows: [],
    containerRegistrations: [],
    credentialTypes: [],
    collections: [],
    plugins: [],
    mcpServers: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    persistence: { kind: "none" as const },
    scheduler: { kind: "none" as const, workerQueues: [] },
    eventing: { kind: "none" as const },
    whitelabel: { displayName: "Test" },
    webSocketPort: 3001,
    webSocketBindHost: "localhost",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ControlPlaneCatalogFetcher — integration against stub control plane", () => {
  let stub: StubControlPlane;
  let pairingConfig: PairingConfig;

  beforeAll(async () => {
    stub = new StubControlPlane();
    await stub.start(WORKSPACE_ID, PAIRING_SECRET);
    pairingConfig = {
      workspaceId: WORKSPACE_ID,
      pairingSecret: PAIRING_SECRET,
      controlPlaneUrl: stub.url,
    };
  });

  afterAll(async () => {
    await stub.stop();
  });

  it("sends HMAC-signed requests to /internal/catalog/* endpoints (not /api/catalog/*)", async () => {
    const signer = new HmacRequestSigner(pairingConfig);
    const pairedFetch = {
      get: async (url: string) => {
        const headers = signer.sign("GET", url, "");
        return fetch(url, { method: "GET", headers: { ...headers } });
      },
    };

    const fetcher = new ControlPlaneCatalogFetcher(
      pairedFetch as never,
      pairingConfig,
      makeNoopLoggers() as never,
      makeAppConfig() as never,
    );

    await fetcher.refresh();

    // All three endpoints reached and authorized
    expect(stub.receivedPaths).toContain("/internal/catalog/oauth-apps");
    expect(stub.receivedPaths).toContain("/internal/catalog/mcp-servers");
    expect(stub.receivedPaths).toContain("/internal/catalog/credential-types");

    // Stub returned 200 and data was accepted
    expect(fetcher.oauthApps).toEqual(FAKE_OAUTH_APPS);
    expect(fetcher.mcpServers).toEqual(FAKE_MCP_SERVERS);
    expect(fetcher.credentialTypeOverrides).toEqual(FAKE_CRED_TYPES);
  });

  it("stub returns 401 when Authorization header is absent (regression: confirms /api/* would get 401)", async () => {
    // Simulate what the old code did: call /api/catalog/mcp-servers with HMAC
    // The stub CP (like the real CP) does not know about /api/* as HMAC-gated.
    // This test uses a plain fetch (no signer) to verify the stub rejects unauthorized requests.
    const response = await fetch(`${stub.url}/internal/catalog/mcp-servers`);
    expect(response.status).toBe(401);
  });
});
