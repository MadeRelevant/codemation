// @vitest-environment node

/**
 * Unit tests for HITL story 11: hitl.task.* span event emissions.
 *
 * Tests verify that the correct span events are emitted at the right callsites
 * without requiring a full DB / Redis stack.
 *
 * Coverage:
 * - NodeSuspensionHandler emits hitl.task.created before deliver
 * - NodeSuspensionHandler emits hitl.task.delivery_failed when deliver throws
 * - HitlTimeoutWorker emits hitl.task.timed_out for halt and auto-accept paths
 *
 * Note: hitl.task.decided is emitted by DecideHumanTaskCommandHandler which has
 * deep DI dependencies (DecisionSchemaValidator uses ajv); tested separately via
 * the integration test path.
 * Note: hitl.task.delivered is emitted by InboxApprovalNode.deliver callback (story 05).
 * Note: hitl.task.cancelled requires a run-cancel hook (story 02 step 6, not yet implemented).
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SuspensionRequest } from "@codemation/core";
import type { HumanTaskHandle } from "@codemation/core";
import { CodemationTelemetryAttributeNames } from "@codemation/core";
import { NodeSuspensionHandler } from "../../../../packages/core/src/execution/NodeSuspensionHandler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalRunState() {
  return {
    runId: "run_test" as never,
    workflowId: "wf_test" as never,
    status: "running" as const,
    startedAt: new Date().toISOString(),
    outputs: {},
    suspension: [],
    nodeExecutionStatuses: {},
  };
}

function makeRepository(runState: ReturnType<typeof makeMinimalRunState>) {
  const state = { ...runState };
  return {
    load: async () => state as never,
    save: async (s: typeof state) => {
      Object.assign(state, s);
    },
  };
}

function makeTelemetrySpy() {
  const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
  const telemetry = {
    addSpanEvent: vi.fn(async (args: { name: string; attributes?: Record<string, unknown> }) => {
      events.push(args);
    }),
    recordMetric: vi.fn(),
    attachArtifact: vi.fn(),
  };
  return { telemetry, events };
}

function makeSuspensionRequest(opts: { deliverThrow?: Error } = {}) {
  return new SuspensionRequest({
    decisionSchema: z.object({ approved: z.boolean() }),
    timeout: "1h",
    onTimeout: "halt",
    subject: { title: "Test Approval", summary: "" },
    metadata: { channel: "test-channel", nodeKey: "test.approval" },
    deliver: async (handle: HumanTaskHandle) => {
      if (opts.deliverThrow) {
        throw opts.deliverThrow;
      }
      return { taskId: handle.taskId };
    },
  });
}

// ---------------------------------------------------------------------------
// NodeSuspensionHandler telemetry
// ---------------------------------------------------------------------------

describe("NodeSuspensionHandler hitl.task.* span events", () => {
  it("emits hitl.task.created before calling deliver", async () => {
    const runState = makeMinimalRunState();
    const repo = makeRepository(runState);
    const handler = new NodeSuspensionHandler(repo as never);
    const { telemetry, events } = makeTelemetrySpy();
    const req = makeSuspensionRequest();

    await expect(
      handler.handle({
        runId: "run_test" as never,
        nodeId: "node_a" as never,
        activationId: "act_1" as never,
        itemIndex: 0,
        suspensionRequest: req,
        state: runState as never,
        telemetry,
      }),
    ).rejects.toThrow(); // RunSuspendedError

    const createdEvent = events.find((e) => e.name === "hitl.task.created");
    expect(createdEvent).toBeDefined();
    expect(createdEvent?.attributes?.[CodemationTelemetryAttributeNames.hitlChannel]).toBe("test-channel");
    expect(createdEvent?.attributes?.[CodemationTelemetryAttributeNames.runId]).toBe("run_test");
    expect(createdEvent?.attributes?.[CodemationTelemetryAttributeNames.nodeId]).toBe("node_a");
    expect(typeof createdEvent?.attributes?.["expiresAt"]).toBe("string");
  });

  it("emits hitl.task.delivery_failed when deliver throws", async () => {
    const runState = makeMinimalRunState();
    const repo = makeRepository(runState);
    const handler = new NodeSuspensionHandler(repo as never);
    const { telemetry, events } = makeTelemetrySpy();
    const deliverError = new Error("Delivery network failure");
    const req = makeSuspensionRequest({ deliverThrow: deliverError });

    await expect(
      handler.handle({
        runId: "run_test" as never,
        nodeId: "node_a" as never,
        activationId: "act_1" as never,
        itemIndex: 0,
        suspensionRequest: req,
        state: runState as never,
        telemetry,
      }),
    ).rejects.toThrow("Delivery network failure");

    const failedEvent = events.find((e) => e.name === "hitl.task.delivery_failed");
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.attributes?.[CodemationTelemetryAttributeNames.hitlChannel]).toBe("test-channel");
    expect(failedEvent?.attributes?.["error"]).toBe("Delivery network failure");
  });

  it("does not emit hitl.task.delivery_failed when deliver succeeds", async () => {
    const runState = makeMinimalRunState();
    const repo = makeRepository(runState);
    const handler = new NodeSuspensionHandler(repo as never);
    const { telemetry, events } = makeTelemetrySpy();
    const req = makeSuspensionRequest();

    await expect(
      handler.handle({
        runId: "run_test" as never,
        nodeId: "node_a" as never,
        activationId: "act_1" as never,
        itemIndex: 0,
        suspensionRequest: req,
        state: runState as never,
        telemetry,
      }),
    ).rejects.toThrow(); // RunSuspendedError

    const failedEvent = events.find((e) => e.name === "hitl.task.delivery_failed");
    expect(failedEvent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HitlTimeoutWorker telemetry (via ResumeTelemetryContextForRun stub)
// ---------------------------------------------------------------------------

describe("HitlTimeoutWorker hitl.task.timed_out span events", () => {
  it("emits hitl.task.timed_out with policy=halt for halt tasks", async () => {
    const { HitlTimeoutWorker } = await import("../../src/hitl/HitlTimeoutWorker");

    const spanEvents: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
    const mockTelemetry = {
      addSpanEvent: vi.fn(async (args: { name: string; attributes?: Record<string, unknown> }) => {
        spanEvents.push(args);
      }),
      recordMetric: vi.fn(),
      attachArtifact: vi.fn(),
    };

    const task = {
      id: "task-halt-1",
      runId: "run-halt-1",
      workflowId: "wf-halt",
      nodeId: "node-approval",
      activationId: "act-1",
      itemIndex: 0,
      status: "pending" as const,
      channel: "inbox",
      subject: { title: "Approve", summary: "" },
      metadata: {},
      decisionSchemaJson: "{}",
      decisionSchemaHash: "abc",
      onTimeout: "halt" as const,
      resumeTokenHash: "tok",
      expiresAt: new Date("2099-01-01"),
      createdAt: new Date(),
      deliveryRef: null,
    };

    const mockStore = {
      findById: vi.fn(async () => task),
      markTimedOut: vi.fn(async () => {}),
      markAutoAccepted: vi.fn(async () => {}),
    };

    const mockEngine = {
      resumeRun: vi.fn(async () => ({ status: "running" as const })),
    };

    const mockScheduler = {
      enqueueTimeoutJob: vi.fn(),
      cancelTimeoutJob: vi.fn(),
      close: vi.fn(),
      getQueueName: vi.fn(() => "test.hitl.timeout"),
    };

    const mockAppConfig = {
      env: { REDIS_URL: "redis://127.0.0.1:6379", AUTH_SECRET: "test" },
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

    const mockResumeTelemetry = {
      forTask: vi.fn(async () => mockTelemetry),
    };

    const worker = new HitlTimeoutWorker(
      mockStore as never,
      mockEngine as never,
      mockScheduler as never,
      mockAppConfig as never,
      mockResumeTelemetry as never,
    );

    await worker.processTimeoutForTask("task-halt-1");

    expect(mockStore.markTimedOut).toHaveBeenCalledWith("task-halt-1");
    const timedOutEvent = spanEvents.find((e) => e.name === "hitl.task.timed_out");
    expect(timedOutEvent).toBeDefined();
    expect(timedOutEvent?.attributes?.[CodemationTelemetryAttributeNames.hitlTaskId]).toBe("task-halt-1");
    expect(timedOutEvent?.attributes?.["policy"]).toBe("halt");
  });

  it("emits hitl.task.timed_out with policy=auto-accept for auto-accept tasks", async () => {
    const { HitlTimeoutWorker } = await import("../../src/hitl/HitlTimeoutWorker");

    const spanEvents: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
    const mockTelemetry = {
      addSpanEvent: vi.fn(async (args: { name: string; attributes?: Record<string, unknown> }) => {
        spanEvents.push(args);
      }),
    };

    const task = {
      id: "task-auto-1",
      runId: "run-auto-1",
      workflowId: "wf-auto",
      nodeId: "node-approval",
      activationId: "act-1",
      itemIndex: 0,
      status: "pending" as const,
      channel: "inbox",
      subject: { title: "Approve", summary: "" },
      metadata: {},
      decisionSchemaJson: "{}",
      decisionSchemaHash: "abc",
      onTimeout: "auto-accept" as const,
      resumeTokenHash: "tok",
      expiresAt: new Date("2099-01-01"),
      createdAt: new Date(),
      deliveryRef: null,
    };

    const mockStore = {
      findById: vi.fn(async () => task),
      markTimedOut: vi.fn(async () => {}),
      markAutoAccepted: vi.fn(async () => {}),
    };

    const mockEngine = {
      resumeRun: vi.fn(async () => ({ status: "running" as const })),
    };

    const mockScheduler = {
      enqueueTimeoutJob: vi.fn(),
      cancelTimeoutJob: vi.fn(),
      close: vi.fn(),
      getQueueName: vi.fn(() => "test.hitl.timeout"),
    };

    const mockAppConfig = {
      env: { REDIS_URL: "redis://127.0.0.1:6379", AUTH_SECRET: "test" },
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

    const mockResumeTelemetry = {
      forTask: vi.fn(async () => mockTelemetry),
    };

    const worker = new HitlTimeoutWorker(
      mockStore as never,
      mockEngine as never,
      mockScheduler as never,
      mockAppConfig as never,
      mockResumeTelemetry as never,
    );

    await worker.processTimeoutForTask("task-auto-1");

    expect(mockStore.markAutoAccepted).toHaveBeenCalledWith("task-auto-1");
    const timedOutEvent = spanEvents.find((e) => e.name === "hitl.task.timed_out");
    expect(timedOutEvent).toBeDefined();
    expect(timedOutEvent?.attributes?.[CodemationTelemetryAttributeNames.hitlTaskId]).toBe("task-auto-1");
    expect(timedOutEvent?.attributes?.["policy"]).toBe("auto-accept");
  });
});
