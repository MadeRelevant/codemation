/**
 * Core unit tests for NodeSuspensionHandler.
 *
 * The host-unit suite (EngineSuspensionAndResume.test.ts) exercises this class too, but
 * its coverage is not attributed to packages/core in the CI `core` flag (host's vitest
 * coverage only instruments packages/host/src). These tests cover the same behaviour
 * plus the optional-seam paths (tokenSigner / humanTaskStore / timeoutScheduler /
 * workspaceId), telemetry events, and the parse/serialize helpers — all in core.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { HitlResumeTokenSignerSeam, HitlTimeoutJobSchedulerSeam } from "../../src/contracts/hitlSeamTypes.ts";
import type { HumanTaskRecord, HumanTaskStore } from "../../src/contracts/humanTaskStoreTypes.ts";
import type { TelemetryScope, TelemetrySpanEventRecord } from "../../src/contracts/telemetryTypes.ts";
import { NodeSuspensionHandler } from "../../src/execution/NodeSuspensionHandler.ts";
import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository.ts";
import { SuspensionRequest, type HumanTaskHandle, type PersistedRunState } from "../../src/index.ts";

// ---------------------------------------------------------------------------
// Builders / fakes
// ---------------------------------------------------------------------------

async function makePendingRunState(repo: InMemoryWorkflowExecutionRepository): Promise<PersistedRunState> {
  await repo.createRun({ runId: "run_1" as never, workflowId: "wf_1" as never, startedAt: new Date().toISOString() });
  return (await repo.load("run_1" as never))!;
}

function makeSuspensionRequest(opts: {
  deliverReturn?: Record<string, string>;
  deliverThrow?: Error;
  onTimeout?: "halt" | "auto-accept";
  timeout?: string;
  metadata?: Record<string, string>;
  decisionSchema?: z.ZodType;
}) {
  const deliverCalls: HumanTaskHandle[] = [];
  const req = new SuspensionRequest({
    decisionSchema: opts.decisionSchema ?? z.object({ approved: z.boolean() }),
    timeout: opts.timeout ?? "PT24H",
    onTimeout: opts.onTimeout ?? "halt",
    subject: { title: "Approve invoice", summary: "Invoice #1234" },
    ...(opts.metadata !== undefined ? { metadata: opts.metadata } : {}),
    deliver: async (handle: HumanTaskHandle) => {
      deliverCalls.push(handle);
      if (opts.deliverThrow) throw opts.deliverThrow;
      return opts.deliverReturn ?? { channel: "slack", ts: "T001" };
    },
  });
  return { req, deliverCalls };
}

class RecordingTokenSigner implements HitlResumeTokenSignerSeam {
  readonly signCalls: Array<{ taskId: string; schemaHash: string }> = [];
  sign(args: { taskId: string; expiresAt: Date; schemaHash: string }): string {
    this.signCalls.push({ taskId: args.taskId, schemaHash: args.schemaHash });
    return `token_for_${args.taskId}`;
  }
  hashToken(token: string): string {
    return `hash_of_${token}`;
  }
}

class RecordingTaskStore implements HumanTaskStore {
  readonly created: HumanTaskRecord[] = [];
  async create(record: HumanTaskRecord): Promise<void> {
    this.created.push(record);
  }
  async findById() {
    return undefined;
  }
  async findByResumeTokenHash() {
    return undefined;
  }
  async findPendingForWorkspace() {
    return [];
  }
  async findAllPending() {
    return [];
  }
  async markDecided() {}
  async markTimedOut() {}
  async markAutoAccepted() {}
  async markCancelled() {}
  async cancelPendingForRun() {}
}

class RecordingTimeoutScheduler implements HitlTimeoutJobSchedulerSeam {
  readonly jobs: Array<{ taskId: string }> = [];
  async enqueueTimeoutJob(args: { taskId: string; expiresAt: Date }): Promise<void> {
    this.jobs.push({ taskId: args.taskId });
  }
}

class RecordingTelemetryScope implements TelemetryScope {
  readonly events: TelemetrySpanEventRecord[] = [];
  async addSpanEvent(args: TelemetrySpanEventRecord): Promise<void> {
    this.events.push(args);
  }
  recordMetric(): void {}
  attachArtifact(): never {
    throw new Error("not used");
  }
}

const baseArgs = {
  runId: "run_1" as never,
  nodeId: "node_a" as never,
  activationId: "act_1" as never,
  itemIndex: 0,
};

// ---------------------------------------------------------------------------

describe("NodeSuspensionHandler.handle — optional seams", () => {
  it("with no seams: suspends, persists entry, throws RunSuspendedError, no-token placeholder", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const handler = new NodeSuspensionHandler(repo);
    const { req } = makeSuspensionRequest({ deliverReturn: { channel: "test" } });

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow();

    const updated = await repo.load("run_1" as never);
    expect(updated?.status).toBe("suspended");
    expect(updated?.suspension).toHaveLength(1);
    expect(updated?.suspension?.[0]?.taskId).toMatch(/^htask_/);
  });

  it("signs a resume token when tokenSigner is provided", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const signer = new RecordingTokenSigner();
    const handler = new NodeSuspensionHandler(repo, undefined, signer);
    const { req, deliverCalls } = makeSuspensionRequest({});

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow();

    expect(signer.signCalls).toHaveLength(1);
    // deliver receives the raw token as resumeUrl
    expect(deliverCalls[0]?.resumeUrl).toMatch(/^token_for_htask_/);
  });

  it("persists a HumanTaskRecord with workspaceId when humanTaskStore + workspaceId provided", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const signer = new RecordingTokenSigner();
    const store = new RecordingTaskStore();
    const handler = new NodeSuspensionHandler(repo, store, signer, undefined, "ws_42");
    const { req } = makeSuspensionRequest({
      deliverReturn: { channel: "slack", ts: "TS" },
      metadata: { channel: "slack" },
    });

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow();

    expect(store.created).toHaveLength(1);
    const record = store.created[0]!;
    expect(record.workspaceId).toBe("ws_42");
    expect(record.runId).toBe("run_1");
    expect(record.deliveryRef).toEqual({ channel: "slack", ts: "TS" });
    // resumeTokenHash derived from the signer's hashToken
    expect(record.resumeTokenHash).toMatch(/^hash_of_token_for_/);
    expect(record.metadata).toEqual({ channel: "slack" });
  });

  it("falls back to 'no-token' resumeTokenHash when store present but no signer", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const store = new RecordingTaskStore();
    const handler = new NodeSuspensionHandler(repo, store);
    const { req } = makeSuspensionRequest({});

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow();

    expect(store.created[0]?.resumeTokenHash).toBe("no-token");
    // workspaceId not provided → undefined
    expect(store.created[0]?.workspaceId).toBeUndefined();
  });

  it("enqueues a timeout job when timeoutScheduler is provided", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const scheduler = new RecordingTimeoutScheduler();
    const handler = new NodeSuspensionHandler(repo, undefined, undefined, scheduler);
    const { req } = makeSuspensionRequest({});

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow();

    expect(scheduler.jobs).toHaveLength(1);
    expect(scheduler.jobs[0]?.taskId).toMatch(/^htask_/);
  });
});

describe("NodeSuspensionHandler.handle — telemetry", () => {
  it("emits hitl.task.created with channel from metadata before deliver", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const telemetry = new RecordingTelemetryScope();
    const handler = new NodeSuspensionHandler(repo);
    const { req } = makeSuspensionRequest({ metadata: { channel: "email" } });

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state, telemetry })).rejects.toThrow();

    const created = telemetry.events.find((e) => e.name === "hitl.task.created");
    expect(created).toBeDefined();
    expect(Object.values(created!.attributes ?? {})).toContain("email");
  });

  it("emits hitl.task.delivery_failed and propagates when deliver throws", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const telemetry = new RecordingTelemetryScope();
    const handler = new NodeSuspensionHandler(repo);
    const { req } = makeSuspensionRequest({ deliverThrow: new Error("Channel unreachable") });

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state, telemetry })).rejects.toThrow(
      "Channel unreachable",
    );

    expect(telemetry.events.some((e) => e.name === "hitl.task.delivery_failed")).toBe(true);
    // Not flipped to suspended — deliver threw before save
    const updated = await repo.load("run_1" as never);
    expect(updated?.status).not.toBe("suspended");
  });

  it("delivery_failed records the metadata channel and coerces a non-Error throw", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const telemetry = new RecordingTelemetryScope();
    const handler = new NodeSuspensionHandler(repo);
    // deliver throws a non-Error value; metadata carries a string channel.
    const req = new SuspensionRequest({
      decisionSchema: z.object({ approved: z.boolean() }),
      timeout: "PT24H",
      onTimeout: "halt",
      subject: { title: "t", summary: "s" },
      metadata: { channel: "teams" },
      deliver: async () => {
        throw "string failure";
      },
    });

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state, telemetry })).rejects.toBe(
      "string failure",
    );

    const failed = telemetry.events.find((e) => e.name === "hitl.task.delivery_failed");
    expect(failed).toBeDefined();
    expect(Object.values(failed!.attributes ?? {})).toContain("teams");
    expect(Object.values(failed!.attributes ?? {})).toContain("string failure");
  });

  it("uses 'unknown' channel when metadata has no string channel", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const telemetry = new RecordingTelemetryScope();
    const handler = new NodeSuspensionHandler(repo);
    const { req } = makeSuspensionRequest({}); // no metadata

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state, telemetry })).rejects.toThrow();

    const created = telemetry.events.find((e) => e.name === "hitl.task.created");
    expect(Object.values(created!.attributes ?? {})).toContain("unknown");
  });
});

describe("NodeSuspensionHandler — duration parsing + schema serialization", () => {
  // parseDurationMs is private; exercised via timeoutAt on the persisted entry.
  async function timeoutAtFor(timeout: string): Promise<number> {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const handler = new NodeSuspensionHandler(repo);
    const { req } = makeSuspensionRequest({ timeout });
    const before = new Date().getTime();
    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow();
    const updated = await repo.load("run_1" as never);
    const at = new Date(updated!.suspension![0]!.timeoutAt!).getTime();
    return at - before;
  }

  it("parses shorthand seconds", async () => {
    expect(await timeoutAtFor("30s")).toBeGreaterThanOrEqual(29_000);
  });
  it("parses shorthand minutes", async () => {
    expect(await timeoutAtFor("5m")).toBeGreaterThanOrEqual(4 * 60_000);
  });
  it("parses shorthand hours", async () => {
    expect(await timeoutAtFor("2h")).toBeGreaterThanOrEqual(1.9 * 3_600_000);
  });
  it("parses shorthand days", async () => {
    expect(await timeoutAtFor("1d")).toBeGreaterThanOrEqual(0.9 * 86_400_000);
  });
  it("parses ISO 8601 with days/hours/minutes/seconds", async () => {
    const ms = await timeoutAtFor("P1DT2H3M4S");
    const expected = (86_400 + 2 * 3_600 + 3 * 60 + 4) * 1_000;
    expect(ms).toBeGreaterThanOrEqual(expected - 2_000);
  });

  it("throws for an unrecognised duration format", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const handler = new NodeSuspensionHandler(repo);
    const { req } = makeSuspensionRequest({ timeout: "soon" });
    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow(
      /unrecognised duration format/,
    );
  });

  it("serializes a non-Zod schema with a toJSON method", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const store = new RecordingTaskStore();
    const handler = new NodeSuspensionHandler(repo, store);
    const customSchema = { toJSON: () => ({ kind: "custom" }) } as unknown as z.ZodType;
    const { req } = makeSuspensionRequest({ decisionSchema: customSchema });

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow();

    expect(store.created[0]?.decisionSchemaJson).toBe(JSON.stringify({ kind: "custom" }));
  });

  it("serializes a plain-object schema via JSON.stringify fallback", async () => {
    const repo = new InMemoryWorkflowExecutionRepository();
    const state = await makePendingRunState(repo);
    const store = new RecordingTaskStore();
    const handler = new NodeSuspensionHandler(repo, store);
    const plainSchema = { shape: "plain" } as unknown as z.ZodType;
    const { req } = makeSuspensionRequest({ decisionSchema: plainSchema });

    await expect(handler.handle({ ...baseArgs, suspensionRequest: req, state })).rejects.toThrow();

    expect(store.created[0]?.decisionSchemaJson).toBe(JSON.stringify({ shape: "plain" }));
  });
});
