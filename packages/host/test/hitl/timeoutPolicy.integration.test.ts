// @vitest-environment node

/**
 * Integration tests for HitlTimeoutWorker.processTimeoutForTask.
 *
 * Tests the halt and auto-accept timeout paths directly (no BullMQ / Redis).
 * The `Engine` is mocked minimally — we only need the `resumeRun` call to be
 * recorded (not actually drive workflow execution).
 */

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { HumanTaskRecord } from "@codemation/core";
import { PrismaHumanTaskStore } from "../../src/infrastructure/persistence/PrismaHumanTaskStore";
import { HitlTimeoutWorker } from "../../src/hitl/HitlTimeoutWorker";
import { HitlTimeoutJobScheduler } from "../../src/hitl/HitlTimeoutJobScheduler";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";
import type { PrismaDatabaseClient as PrismaClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FUTURE = new Date("2099-01-01T12:00:00.000Z");
const SCHEMA_JSON = JSON.stringify({ type: "object", properties: { approved: { type: "boolean" } } });

function makeTask(overrides: Partial<HumanTaskRecord> = {}): HumanTaskRecord {
  return {
    id: `task-${randomUUID()}`,
    runId: `run-${randomUUID()}`,
    workflowId: "wf.hitl.timeout",
    nodeId: "approval",
    activationId: `act-${randomUUID()}`,
    itemIndex: 0,
    status: "pending",
    channel: "inbox",
    subject: { title: "Approve", summary: "Please approve" },
    metadata: {},
    decisionSchemaJson: SCHEMA_JSON,
    decisionSchemaHash: "abc12345",
    onTimeout: "halt",
    resumeTokenHash: `tok-${randomUUID()}`,
    expiresAt: FUTURE,
    createdAt: new Date(),
    ...overrides,
  };
}

function createStubEngine(resumeCalls: unknown[]) {
  return {
    resumeRun: async (args: unknown) => {
      resumeCalls.push(args);
      return { status: "running" as const };
    },
  };
}

function makeSchedulerStub(): HitlTimeoutJobScheduler {
  return {
    enqueueTimeoutJob: vi.fn(),
    cancelTimeoutJob: vi.fn(),
    close: vi.fn(),
    getQueueName: vi.fn(() => "stub.hitl.timeout"),
  } as unknown as HitlTimeoutJobScheduler;
}

function makeAppConfig() {
  return {
    env: { REDIS_URL: "redis://127.0.0.1:6379", AUTH_SECRET: "test-secret" },
    persistence: { kind: "postgresql" as const },
    consumerRoot: "/tmp",
    repoRoot: "/tmp",
    workflowSources: [],
    workflows: [],
    containerRegistrations: [],
    credentialTypes: [],
    collections: [],
    plugins: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    scheduler: { kind: "local" as const, workerQueues: [] },
    eventing: { kind: "memory" as const },
    auth: { kind: "local" as const, allowUnauthenticatedInDevelopment: false },
    whitelabel: {},
    webSocketPort: 3001,
    webSocketBindHost: "127.0.0.1",
    mcpServers: [],
  };
}

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

class TimeoutPolicyContext {
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

  getPrismaClient(): PrismaClient {
    if (!this.session.transaction) throw new Error("start() must be called first");
    return this.session.transaction.getPrismaClient();
  }

  createStore(): PrismaHumanTaskStore {
    return new PrismaHumanTaskStore(this.getPrismaClient());
  }

  createWorker(store: PrismaHumanTaskStore, resumeCalls: unknown[]): HitlTimeoutWorker {
    const engine = createStubEngine(resumeCalls);
    const scheduler = makeSchedulerStub();
    const appConfig = makeAppConfig();
    const noOpResumeTelemetry = { forTask: async () => undefined } as never;
    return new HitlTimeoutWorker(store, engine as never, scheduler, appConfig as never, noOpResumeTelemetry);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HitlTimeoutWorker.processTimeoutForTask", () => {
  const ctx = new TimeoutPolicyContext();

  beforeAll(async () => {
    await ctx.start();
  });

  afterEach(async () => {
    await ctx.afterEach();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("halt policy: marks task timed_out and resumes run with timed_out decision", async () => {
    const store = ctx.createStore();
    const resumeCalls: unknown[] = [];
    const worker = ctx.createWorker(store, resumeCalls);
    const task = makeTask({ onTimeout: "halt" });
    await store.create(task);

    await worker.processTimeoutForTask(task.id);

    const updated = await store.findById(task.id);
    expect(updated?.status).toBe("timed_out");
    expect(resumeCalls).toHaveLength(1);
    const call = resumeCalls[0] as { resumeContext: { decision: { kind: string } } };
    expect(call.resumeContext.decision.kind).toBe("timed_out");
  });

  it("auto-accept policy: marks task auto_accepted and resumes run with auto_accepted decision", async () => {
    const store = ctx.createStore();
    const resumeCalls: unknown[] = [];
    const worker = ctx.createWorker(store, resumeCalls);
    const task = makeTask({ onTimeout: "auto-accept" });
    await store.create(task);

    await worker.processTimeoutForTask(task.id);

    const updated = await store.findById(task.id);
    expect(updated?.status).toBe("auto_accepted");
    expect(resumeCalls).toHaveLength(1);
    const call = resumeCalls[0] as { resumeContext: { decision: { kind: string } } };
    expect(call.resumeContext.decision.kind).toBe("auto_accepted");
  });

  it("no-op if task is not found", async () => {
    const store = ctx.createStore();
    const resumeCalls: unknown[] = [];
    const worker = ctx.createWorker(store, resumeCalls);

    await worker.processTimeoutForTask("nonexistent-task-id");

    expect(resumeCalls).toHaveLength(0);
  });

  it("no-op if task is already decided (not pending)", async () => {
    const store = ctx.createStore();
    const resumeCalls: unknown[] = [];
    const worker = ctx.createWorker(store, resumeCalls);
    const task = makeTask({ status: "decided" });
    await store.create(task);

    await worker.processTimeoutForTask(task.id);

    expect(resumeCalls).toHaveLength(0);
    const updated = await store.findById(task.id);
    expect(updated?.status).toBe("decided"); // unchanged
  });
});
