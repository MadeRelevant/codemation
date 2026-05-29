// @vitest-environment node

/**
 * Regression test: managed-auth mode must boot with a SQLite database.
 *
 * Sprint 3 Story 6 introduced a normalizer guard that rejected sqlite when
 * auth.kind === "managed", causing a crash at host boot. Commit 35b8732c
 * removed that guard. This test ensures the regression cannot silently
 * reappear.
 *
 * What we assert:
 * - The host boots without throwing (implicit — beforeAll would fail).
 * - A signed /api/me request returns 200 (auth pipeline is functional).
 * - /api/auth/* returns 404 (Better Auth is not mounted in managed mode).
 */

import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { SqliteIntegrationDatabase } from "./testkit/SqliteIntegrationDatabase";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
import { ManagedAuthTestJwks, ManagedAuthTestJwksServer } from "../testkit/ManagedAuthTestJwks";

const WORKSPACE_ID = "ws-sqlite-managed-test";
const ISSUER = "https://cp.sqlite.integration.test";
const CP_WEB_ORIGIN = "https://app.cp.sqlite.integration.test";

// Fixed far-future exp so tests never depend on wall-clock time
const EXP_FUTURE_UNIX = Math.floor(new Date("2099-12-31T00:00:00Z").getTime() / 1000);
const NBF_PAST_UNIX = Math.floor(new Date("2000-01-01T00:00:00Z").getTime() / 1000);

describe("managed auth + sqlite boot regression", () => {
  let testJwks: ManagedAuthTestJwks;
  let jwksServer: ManagedAuthTestJwksServer;
  let harness: FrontendHttpIntegrationHarness;
  let database: SqliteIntegrationDatabase;

  beforeAll(async () => {
    testJwks = await ManagedAuthTestJwks.generate("sqlite-managed-key-1");
    jwksServer = new ManagedAuthTestJwksServer();
    await jwksServer.start(testJwks.publicJwks());

    database = await SqliteIntegrationDatabase.create();

    // workflowDiscovery.directories must be non-empty for managed mode (normalizer invariant).
    // The test directory has no workflow files — an empty discovery list is intentional here.
    const baseConfig: CodemationConfig = {
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: { kind: "managed" },
      workflowDiscovery: { directories: [import.meta.dirname] },
    };

    const config = mergeIntegrationDatabaseRuntime(baseConfig, database);

    harness = new FrontendHttpIntegrationHarness({
      config,
      consumerRoot: path.resolve(import.meta.dirname, "../.."),
      env: {
        WORKSPACE_ID,
        WORKSPACE_PAIRING_SECRET: "Y29kZW1hdGlvbi1tYW5hZ2VkLWF1dGgtdGVzdC0zMmI=",
        CONTROL_PLANE_URL: "https://cp.sqlite.integration.test",
        CONTROL_PLANE_JWKS_URL: jwksServer.jwksUrl(),
        CONTROL_PLANE_ISSUER: ISSUER,
        CP_WEB_ORIGIN,
      },
    });
    await harness.start();
  });

  afterAll(async () => {
    await harness.close();
    await jwksServer.stop();
    await database.close();
  });

  it("managed + sqlite: host boots and /api/me returns 200 for a signed JWT", async () => {
    const token = await testJwks.sign({
      iss: ISSUER,
      aud: WORKSPACE_ID,
      exp: EXP_FUTURE_UNIX,
      nbf: NBF_PAST_UNIX,
    });
    const response = await harness.request({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ userId: string; workspaceId: string }>();
    expect(body).toMatchObject({ workspaceId: WORKSPACE_ID });
  });

  it("managed + sqlite: /api/auth/* returns 404 (Better Auth not mounted)", async () => {
    const response = await harness.request({
      method: "GET",
      url: "/api/auth/session",
    });
    expect(response.statusCode).toBe(404);
  });
});
