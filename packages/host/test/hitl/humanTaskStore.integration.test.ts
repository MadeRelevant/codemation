// @vitest-environment node

/**
 * Integration tests for PrismaHumanTaskStore — HITL story 02.
 *
 * Covers: create, findById, findByResumeTokenHash, findPendingForWorkspace,
 *         markDecided, markTimedOut, markAutoAccepted, markCancelled, cancelPendingForRun.
 */

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { HumanTaskRecord } from "@codemation/core";
import { PrismaHumanTaskStore } from "../../src/infrastructure/persistence/PrismaHumanTaskStore";
import type { PrismaDatabaseClient as PrismaClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const FUTURE = new Date("2099-01-01T12:00:00.000Z"); // far future
const SCHEMA_JSON = JSON.stringify({ type: "object", properties: { approved: { type: "boolean" } } });
const SCHEMA_HASH = "abc12345678"; // first 8 chars used by token

function makeTask(overrides: Partial<HumanTaskRecord> = {}): HumanTaskRecord {
  return {
    id: `task-${randomUUID()}`,
    runId: `run-${randomUUID()}`,
    workflowId: "wf.hitl.test",
    workspaceId: "ws-test",
    nodeId: "approval",
    activationId: `act-${randomUUID()}`,
    itemIndex: 0,
    status: "pending",
    channel: "inbox",
    subject: { title: "Review request", summary: "Please approve or reject" },
    metadata: {},
    decisionSchemaJson: SCHEMA_JSON,
    decisionSchemaHash: SCHEMA_HASH,
    onTimeout: "halt",
    resumeTokenHash: `tok-hash-${randomUUID()}`,
    expiresAt: FUTURE,
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

class HumanTaskStoreIntegrationContext {
  private readonly session = new IntegrationTestDatabaseSession();

  async start(): Promise<void> {
    await this.session.start();
  }

  async afterEach(): Promise<void> {
    await this.session.afterEach();
  }

  async stop(): Promise<void> {
    await this.session.dispose();
  }

  createStore(): PrismaHumanTaskStore {
    return new PrismaHumanTaskStore(this.requirePrismaClient());
  }

  private requirePrismaClient(): PrismaClient {
    if (!this.session.transaction) {
      throw new Error("HumanTaskStoreIntegrationContext.start() must be called first.");
    }
    return this.session.transaction.getPrismaClient();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PrismaHumanTaskStore", () => {
  const ctx = new HumanTaskStoreIntegrationContext();

  beforeAll(async () => {
    await ctx.start();
  });

  afterEach(async () => {
    await ctx.afterEach();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("creates and finds a task by id", async () => {
    const store = ctx.createStore();
    const task = makeTask();
    await store.create(task);
    const found = await store.findById(task.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(task.id);
    expect(found?.status).toBe("pending");
    expect(found?.decisionSchemaHash).toBe(SCHEMA_HASH);
  });

  it("findById returns undefined for unknown task", async () => {
    const store = ctx.createStore();
    const result = await store.findById("no-such-task");
    expect(result).toBeUndefined();
  });

  it("finds a task by resume token hash", async () => {
    const store = ctx.createStore();
    const task = makeTask({ resumeTokenHash: `unique-hash-${randomUUID()}` });
    await store.create(task);
    const found = await store.findByResumeTokenHash(task.resumeTokenHash);
    expect(found?.id).toBe(task.id);
  });

  it("findByResumeTokenHash returns undefined for unknown hash", async () => {
    const store = ctx.createStore();
    const result = await store.findByResumeTokenHash("unknown-hash");
    expect(result).toBeUndefined();
  });

  it("finds pending tasks for workspace", async () => {
    const store = ctx.createStore();
    const wsId = `ws-${randomUUID()}`;
    const t1 = makeTask({ workspaceId: wsId });
    const t2 = makeTask({ workspaceId: wsId });
    await store.create(t1);
    await store.create(t2);

    const results = await store.findPendingForWorkspace(wsId);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual([t1.id, t2.id].sort());
  });

  it("does not return decided tasks in findPendingForWorkspace", async () => {
    const store = ctx.createStore();
    const wsId = `ws-${randomUUID()}`;
    const pending = makeTask({ workspaceId: wsId });
    const decided = makeTask({ workspaceId: wsId, status: "decided" });
    await store.create(pending);
    await store.create(decided);

    const results = await store.findPendingForWorkspace(wsId);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(pending.id);
  });

  it("markDecided transitions status and stores decision", async () => {
    const store = ctx.createStore();
    const task = makeTask();
    await store.create(task);

    const decidedAt = new Date();
    await store.markDecided({
      taskId: task.id,
      decision: { approved: true },
      decidedBy: { actorId: "user-1", displayName: "Alice" },
      decidedAt,
    });

    const updated = await store.findById(task.id);
    expect(updated?.status).toBe("decided");
    expect(updated?.decision).toEqual({ approved: true });
    expect(updated?.decidedBy?.actorId).toBe("user-1");
    expect(updated?.decidedAt).toEqual(decidedAt);
  });

  it("markTimedOut transitions status", async () => {
    const store = ctx.createStore();
    const task = makeTask();
    await store.create(task);
    await store.markTimedOut(task.id);
    const updated = await store.findById(task.id);
    expect(updated?.status).toBe("timed_out");
  });

  it("markAutoAccepted transitions status", async () => {
    const store = ctx.createStore();
    const task = makeTask();
    await store.create(task);
    await store.markAutoAccepted(task.id);
    const updated = await store.findById(task.id);
    expect(updated?.status).toBe("auto_accepted");
  });

  it("markCancelled transitions status", async () => {
    const store = ctx.createStore();
    const task = makeTask();
    await store.create(task);
    await store.markCancelled(task.id);
    const updated = await store.findById(task.id);
    expect(updated?.status).toBe("cancelled");
  });

  it("cancelPendingForRun cancels all pending tasks for a run", async () => {
    const store = ctx.createStore();
    const runId = `run-${randomUUID()}`;
    const t1 = makeTask({ runId });
    const t2 = makeTask({ runId });
    const t3 = makeTask({ runId, status: "decided" }); // should not be affected
    await store.create(t1);
    await store.create(t2);
    await store.create(t3);

    await store.cancelPendingForRun(runId);

    const [r1, r2, r3] = await Promise.all([store.findById(t1.id), store.findById(t2.id), store.findById(t3.id)]);
    expect(r1?.status).toBe("cancelled");
    expect(r2?.status).toBe("cancelled");
    expect(r3?.status).toBe("decided"); // unchanged
  });
});
