// @vitest-environment node

/**
 * Integration tests for ControlPlaneInboxChannel + inbound callback receiver.
 *
 * Outbound tests: ControlPlaneInboxChannel.deliver() issues a signed POST to a
 * mock CP server; verifies body shape and HMAC signature.
 *
 * Inbound tests: POST /internal/hitl/tasks/:taskId/callback — HMAC-verified;
 * covers workspace mismatch (403), replay / already-decided (409), signature
 * failure (401), and the timeout path (200 + markTimedOut in DB).
 */

import path from "node:path";
import { randomBytes, createHmac, createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import type { HumanTaskRecord } from "@codemation/core";
import { ApplicationTokens } from "../../src/applicationTokens";
import { FrontendHttpIntegrationHarness } from "../http/testkit/FrontendHttpIntegrationHarness";
import { IntegrationDatabaseFactory } from "../http/testkit/IntegrationDatabaseFactory";
import type { IntegrationDatabase } from "../http/testkit/IntegrationDatabaseFactory";
import { mergeIntegrationDatabaseRuntime } from "../http/testkit/mergeIntegrationDatabaseRuntime";
import { PrismaHumanTaskStore } from "../../src/infrastructure/persistence/PrismaHumanTaskStore";
import { HmacRequestSigner } from "../../src/pairing/HmacRequestSigner";
import type { PairingConfig } from "../../src/pairing/pairing.types";
import { ControlPlaneInboxChannel } from "../../src/hitl/ControlPlaneInboxChannel";
import { MockControlPlaneInboxServer } from "./_mock-cp/MockControlPlaneInboxServer";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "ws-cp-inbox-integration-test";
const PAIRING_SECRET = randomBytes(32).toString("base64");
const AUTH_SECRET = randomBytes(32).toString("hex");

const FUTURE = new Date("2099-01-01T12:00:00.000Z");
const SCHEMA_JSON = JSON.stringify({ type: "object", properties: { approved: { type: "boolean" } } });
const SCHEMA_HASH = "abc12345";

function makePairingConfig(controlPlaneUrl: string): PairingConfig {
  return { workspaceId: WORKSPACE_ID, pairingSecret: PAIRING_SECRET, controlPlaneUrl };
}

function makeTask(overrides: Partial<HumanTaskRecord> = {}): HumanTaskRecord {
  return {
    id: `task-${randomUUID()}`,
    runId: `run-${randomUUID()}`,
    workflowId: "wf.hitl.cp-inbox-test",
    workspaceId: WORKSPACE_ID,
    nodeId: "approval",
    activationId: `act-${randomUUID()}`,
    itemIndex: 0,
    status: "pending",
    channel: "inbox",
    subject: { title: "Approve", summary: "Please approve" },
    metadata: {},
    decisionSchemaJson: SCHEMA_JSON,
    decisionSchemaHash: SCHEMA_HASH,
    onTimeout: "halt",
    resumeTokenHash: `tok-${randomUUID()}`,
    expiresAt: FUTURE,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeNoopLoggers() {
  const noop = () => {};
  return {
    create: (_scope: string) => ({ info: noop, debug: noop, warn: noop, error: noop }),
  };
}

/** Sign a POST /internal/hitl/tasks/:taskId/callback body using the pairing secret. */
function signCallbackRequest(taskId: string, bodyJson: string): string {
  // eslint-disable-next-line no-restricted-properties -- integration sign helper; requires real wall-clock timestamp
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("base64");
  const urlPath = `/internal/hitl/tasks/${taskId}/callback`;
  const bodyHash = createHash("sha256").update(bodyJson, "utf8").digest("hex");
  const baseString = ["POST", urlPath, ts, nonce, bodyHash].join("\n");
  // eslint-disable-next-line codemation/no-buffer-everything -- integration test: bounded pairing secret
  const secretBytes = Buffer.from(PAIRING_SECRET, "base64");
  const sig = createHmac("sha256", secretBytes).update(baseString, "utf8").digest("base64");
  return `Codemation-Hmac v=1,workspaceId=${WORKSPACE_ID},ts=${ts},nonce=${nonce},sig=${sig}`;
}

// ── Managed-mode harness factory ──────────────────────────────────────────────

async function createInboundHarness(
  database: IntegrationDatabase,
  mockCpUrl: string,
): Promise<FrontendHttpIntegrationHarness> {
  const baseConfig: CodemationConfig = {
    runtime: {
      eventBus: { kind: "memory" },
      scheduler: { kind: "local" },
    },
    auth: { kind: "managed" },
    workflowDiscovery: { directories: [import.meta.dirname] },
  };

  const config = mergeIntegrationDatabaseRuntime(baseConfig, database);
  const harness = new FrontendHttpIntegrationHarness({
    config,
    consumerRoot: path.resolve(import.meta.dirname, "../.."),
    env: {
      WORKSPACE_ID,
      WORKSPACE_PAIRING_SECRET: PAIRING_SECRET,
      CONTROL_PLANE_URL: mockCpUrl,
      CONTROL_PLANE_JWKS_URL: `${mockCpUrl}/.well-known/jwks.json`,
      CONTROL_PLANE_ISSUER: mockCpUrl,
      CP_WEB_ORIGIN: mockCpUrl,
      // Required by HitlResumeTokenSigner (wired at app boot)
      AUTH_SECRET,
    },
    // Share the same Prisma client so tasks inserted by the test are visible inside the harness
    register: (context) => {
      context.registerValue(ApplicationTokens.PrismaClient, database.getPrismaClient());
    },
  });
  await harness.start();
  return harness;
}

// ────────────────────────────────────────────────────────────────────────────
// Outbound tests — ControlPlaneInboxChannel.deliver()
// ────────────────────────────────────────────────────────────────────────────

describe("ControlPlaneInboxChannel (outbound)", () => {
  let mockCp: MockControlPlaneInboxServer;

  beforeAll(async () => {
    mockCp = new MockControlPlaneInboxServer(WORKSPACE_ID, PAIRING_SECRET);
    await mockCp.start();
  });

  afterEach(() => {
    mockCp.receivedDeliveries.length = 0;
    mockCp.clearResponseStatus();
  });

  afterAll(async () => {
    await mockCp.stop();
  });

  it("deliver() sends HMAC-signed POST to CP and returns cp delivery with inboxItemId", async () => {
    const pairingConfig = makePairingConfig(mockCp.url);
    const signer = new HmacRequestSigner(pairingConfig);
    const pairedFetch = {
      post: async (url: string, body: unknown) => {
        const bodyString = JSON.stringify(body);
        const headers = signer.sign("POST", url, bodyString);
        return fetch(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: bodyString,
        });
      },
    };

    const channel = new ControlPlaneInboxChannel(pairedFetch as never, pairingConfig, makeNoopLoggers() as never);

    const taskId = `task-${randomUUID()}`;
    const delivery = await channel.deliver({
      task: {
        taskId,
        runId: `run-${randomUUID()}`,
        nodeId: "approval",
        expiresAt: FUTURE,
        resumeUrl: "https://example.com/resume",
      },
      subject: { title: "Approve", summary: "Please approve" },
      priority: "normal",
      item: { json: { value: "test" } },
      workspaceId: WORKSPACE_ID,
    });

    expect(delivery.kind).toBe("cp");
    expect(delivery.inboxItemId).toBe(`inbox-${taskId}`);
    expect(mockCp.receivedDeliveries).toHaveLength(1);
    const received = mockCp.receivedDeliveries[0]!;
    expect(received.path).toBe("/internal/hitl/tasks");
    const body = received.body as { taskId: string; workspaceId: string; priority: string };
    expect(body.taskId).toBe(taskId);
    expect(body.workspaceId).toBe(WORKSPACE_ID);
    expect(body.priority).toBe("normal");
  });

  it("deliver() throws when CP returns 5xx", async () => {
    mockCp.setResponseStatus(503);

    const pairingConfig = makePairingConfig(mockCp.url);
    const signer = new HmacRequestSigner(pairingConfig);
    const pairedFetch = {
      post: async (url: string, body: unknown) => {
        const bodyString = JSON.stringify(body);
        const headers = signer.sign("POST", url, bodyString);
        return fetch(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: bodyString,
        });
      },
    };

    const channel = new ControlPlaneInboxChannel(pairedFetch as never, pairingConfig, makeNoopLoggers() as never);

    await expect(
      channel.deliver({
        task: {
          taskId: `task-${randomUUID()}`,
          runId: `run-${randomUUID()}`,
          nodeId: "approval",
          expiresAt: FUTURE,
          resumeUrl: "https://example.com/resume",
        },
        subject: { title: "Approve", summary: "Please approve" },
        priority: "normal",
        item: { json: { value: "test" } },
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toThrow("CP push failed with status 503");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Inbound tests — POST /internal/hitl/tasks/:taskId/callback
// ────────────────────────────────────────────────────────────────────────────

describe("HitlInternalCallbackHonoApiRouteRegistrar (inbound)", () => {
  let database: IntegrationDatabase;
  let mockCp: MockControlPlaneInboxServer;
  let harness: FrontendHttpIntegrationHarness;
  let taskStore: PrismaHumanTaskStore;
  const insertedTaskIds: string[] = [];

  beforeAll(async () => {
    mockCp = new MockControlPlaneInboxServer(WORKSPACE_ID, PAIRING_SECRET);
    await mockCp.start();

    // Use IntegrationDatabaseFactory so the test shares a single migrated DB instance;
    // the harness receives the same Prisma client via register() below.
    database = await IntegrationDatabaseFactory.create();
    harness = await createInboundHarness(database, mockCp.url);
    taskStore = new PrismaHumanTaskStore(database.getPrismaClient());
  });

  afterEach(async () => {
    // Clean up tasks inserted during tests — delete in reverse order to avoid FK issues
    if (insertedTaskIds.length > 0) {
      for (const taskId of insertedTaskIds.splice(0)) {
        try {
          await database.getPrismaClient().humanTask.delete({ where: { id: taskId } });
        } catch {
          // Task may have already been deleted or updated — ignore
        }
      }
    }
  });

  afterAll(async () => {
    await harness.close();
    await database.close();
    await mockCp.stop();
  });

  async function insertTask(overrides: Partial<HumanTaskRecord> = {}): Promise<HumanTaskRecord> {
    const task = makeTask(overrides);
    await taskStore.create(task);
    insertedTaskIds.push(task.id);
    return task;
  }

  it("missing Authorization header → 401", async () => {
    const bodyJson = JSON.stringify({ kind: "timeout" });
    const response = await harness.request({
      method: "POST",
      url: `/internal/hitl/tasks/task-nonexistent/callback`,
      headers: { "content-type": "application/json" },
      payload: bodyJson,
    });
    expect(response.statusCode).toBe(401);
  });

  it("tampered signature → 401", async () => {
    const bodyJson = JSON.stringify({ kind: "timeout" });
    const authorization = signCallbackRequest("task-any", bodyJson);
    const tampered = authorization.slice(0, -1) + (authorization.endsWith("A") ? "B" : "A");

    const response = await harness.request({
      method: "POST",
      url: `/internal/hitl/tasks/task-any/callback`,
      headers: { authorization: tampered, "content-type": "application/json" },
      payload: bodyJson,
    });
    expect(response.statusCode).toBe(401);
  });

  it("valid HMAC-signed timeout callback → 200 and task marked timed_out in DB", async () => {
    const task = await insertTask({ status: "pending" });

    const bodyJson = JSON.stringify({ kind: "timeout" });
    const authorization = signCallbackRequest(task.id, bodyJson);

    const response = await harness.request({
      method: "POST",
      url: `/internal/hitl/tasks/${task.id}/callback`,
      headers: { authorization, "content-type": "application/json" },
      payload: bodyJson,
    });

    expect(response.statusCode).toBe(200);
    const updated = await taskStore.findById(task.id);
    expect(updated?.status).toBe("timed_out");
  });

  it("wrong workspaceId in task → 403", async () => {
    const task = await insertTask({ workspaceId: "ws-different-workspace" });

    const bodyJson = JSON.stringify({ kind: "timeout" });
    const authorization = signCallbackRequest(task.id, bodyJson);

    const response = await harness.request({
      method: "POST",
      url: `/internal/hitl/tasks/${task.id}/callback`,
      headers: { authorization, "content-type": "application/json" },
      payload: bodyJson,
    });
    expect(response.statusCode).toBe(403);
  });

  it("already-decided task → 409", async () => {
    const task = await insertTask({ status: "decided" });

    const bodyJson = JSON.stringify({ kind: "timeout" });
    const authorization = signCallbackRequest(task.id, bodyJson);

    const response = await harness.request({
      method: "POST",
      url: `/internal/hitl/tasks/${task.id}/callback`,
      headers: { authorization, "content-type": "application/json" },
      payload: bodyJson,
    });
    expect(response.statusCode).toBe(409);
  });
});
