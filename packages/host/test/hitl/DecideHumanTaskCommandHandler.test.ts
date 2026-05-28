// @vitest-environment node

/**
 * Unit tests for DecideHumanTaskCommandHandler error/branch coverage.
 *
 * Covers the failure modes of `.decide()` (503 no-store, 404 not-found,
 * 409 not-pending, 422 schema-invalid), the decisionStatus mapping
 * (approved/rejected/decided), the timeout-cancel + telemetry span, and the
 * halt-vs-running result mapping. Also covers `.validateResumeToken()`
 * (410 expired, 401 invalid, 401 taskId mismatch, 503 no-store, 404 not-found,
 * 410 schema drift, happy path).
 *
 * Constructed with hand-built stubs (no DI container, no DB) following the
 * manual-stub pattern in HitlTelemetrySpans.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import type { HumanTaskRecord, JsonValue } from "@codemation/core";
import { CodemationTelemetryAttributeNames } from "@codemation/core";
import { DecideHumanTaskCommandHandler } from "../../src/application/hitl/DecideHumanTaskCommandHandler";

// ── Builders ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<HumanTaskRecord> = {}): HumanTaskRecord {
  return {
    id: "task-1",
    runId: "run-1",
    workflowId: "wf-1",
    nodeId: "approval",
    activationId: "act-1",
    itemIndex: 0,
    status: "pending",
    channel: "inbox",
    subject: { title: "Approve", summary: "" },
    metadata: {},
    decisionSchemaJson: "{}",
    decisionSchemaHash: "abcdef0123456789",
    onTimeout: "halt",
    resumeTokenHash: "tok",
    expiresAt: new Date("2099-01-01"),
    createdAt: new Date("2020-01-01"),
    deliveryRef: null,
    ...overrides,
  };
}

type VerifyResult =
  | { ok: true; taskId: string; schemaHash: string; expiresAt: Date }
  | { ok: false; reason: "malformed" | "bad_sig" | "expired" };

type HandlerStubs = {
  store: { findById: ReturnType<typeof vi.fn>; markDecided: ReturnType<typeof vi.fn> } | undefined;
  engine: { resumeRun: ReturnType<typeof vi.fn> };
  scheduler: { cancelTimeoutJob: ReturnType<typeof vi.fn> };
  validator: { validate: ReturnType<typeof vi.fn> };
  resumeTelemetry: { forTask: ReturnType<typeof vi.fn> };
  tokenSigner: { verify: ReturnType<typeof vi.fn> };
  spanEvents: Array<{ name: string; attributes?: Record<string, unknown> }>;
};

function makeStubs(
  opts: {
    task?: HumanTaskRecord | undefined;
    storeUndefined?: boolean;
    validateResult?: { valid: true } | { valid: false; message: string };
    resumeStatus?: "running" | "halted" | "failed" | "completed";
    verifyResult?: VerifyResult;
  } = {},
): { handler: DecideHumanTaskCommandHandler; stubs: HandlerStubs } {
  const spanEvents: HandlerStubs["spanEvents"] = [];
  const telemetry = {
    addSpanEvent: vi.fn(async (e: { name: string; attributes?: Record<string, unknown> }) => {
      spanEvents.push(e);
    }),
  };

  const store = opts.storeUndefined
    ? undefined
    : {
        findById: vi.fn(async () => opts.task),
        markDecided: vi.fn(async () => {}),
      };
  const engine = { resumeRun: vi.fn(async () => ({ status: opts.resumeStatus ?? "running" })) };
  const scheduler = { cancelTimeoutJob: vi.fn(async () => {}) };
  const validator = { validate: vi.fn(() => opts.validateResult ?? ({ valid: true } as const)) };
  const resumeTelemetry = { forTask: vi.fn(async () => telemetry) };
  const tokenSigner = { verify: vi.fn(() => opts.verifyResult) };

  const handler = new DecideHumanTaskCommandHandler(
    store as never,
    engine as never,
    tokenSigner as never,
    scheduler as never,
    validator as never,
    resumeTelemetry as never,
  );

  return { handler, stubs: { store, engine, scheduler, validator, resumeTelemetry, tokenSigner, spanEvents } };
}

const baseArgs = { taskId: "task-1", decision: { approved: true } as JsonValue, decidedBy: { actorId: "u1" } };

// ── decide() error branches ─────────────────────────────────────────────────────

describe("DecideHumanTaskCommandHandler.decide error branches", () => {
  it("throws 503 when task store is not configured", async () => {
    const { handler } = makeStubs({ storeUndefined: true });
    await expect(handler.decide(baseArgs)).rejects.toMatchObject({ status: 503 });
  });

  it("throws 404 when the task does not exist", async () => {
    const { handler } = makeStubs({ task: undefined });
    await expect(handler.decide(baseArgs)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when the task is not pending", async () => {
    const { handler } = makeStubs({ task: makeTask({ status: "decided" }) });
    await expect(handler.decide(baseArgs)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("decided"),
    });
  });

  it("throws 422 when the decision fails schema validation", async () => {
    const { handler } = makeStubs({
      task: makeTask(),
      validateResult: { valid: false, message: "missing required property approved" },
    });
    await expect(handler.decide(baseArgs)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("missing required property approved"),
    });
  });
});

// ── decide() happy path: side effects + telemetry + result mapping ──────────────

describe("DecideHumanTaskCommandHandler.decide happy path", () => {
  it("marks decided, cancels the timeout job, and returns runStatus running", async () => {
    const { handler, stubs } = makeStubs({ task: makeTask(), resumeStatus: "running" });
    const result = await handler.decide(baseArgs);

    expect(result).toEqual({ status: "decided", runStatus: "running" });
    expect(stubs.store!.markDecided).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task-1", decision: { approved: true }, decidedBy: { actorId: "u1" } }),
    );
    expect(stubs.scheduler.cancelTimeoutJob).toHaveBeenCalledWith("task-1");
  });

  it("maps a halted resume result to runStatus halted", async () => {
    const { handler } = makeStubs({ task: makeTask(), resumeStatus: "halted" });
    const result = await handler.decide(baseArgs);
    expect(result.runStatus).toBe("halted");
  });

  it("maps a failed resume result to runStatus halted", async () => {
    const { handler } = makeStubs({ task: makeTask(), resumeStatus: "failed" });
    const result = await handler.decide(baseArgs);
    expect(result.runStatus).toBe("halted");
  });

  it("emits hitl.task.decided with decisionStatus=approved and latency from createdAt", async () => {
    const { handler, stubs } = makeStubs({ task: makeTask({ createdAt: new Date("2020-01-01") }) });
    await handler.decide({ ...baseArgs, decision: { approved: true } });

    const ev = stubs.spanEvents.find((e) => e.name === "hitl.task.decided");
    expect(ev).toBeDefined();
    expect(ev?.attributes?.[CodemationTelemetryAttributeNames.hitlDecisionStatus]).toBe("approved");
    expect(ev?.attributes?.["actor"]).toBe("u1");
    expect(typeof ev?.attributes?.["latencyMs"]).toBe("number");
  });

  it("emits decisionStatus=rejected when approved is false", async () => {
    const { handler, stubs } = makeStubs({ task: makeTask() });
    await handler.decide({ ...baseArgs, decision: { approved: false } });
    const ev = stubs.spanEvents.find((e) => e.name === "hitl.task.decided");
    expect(ev?.attributes?.[CodemationTelemetryAttributeNames.hitlDecisionStatus]).toBe("rejected");
  });

  it("emits decisionStatus=decided when the decision has no approved boolean", async () => {
    const { handler, stubs } = makeStubs({ task: makeTask() });
    await handler.decide({ ...baseArgs, decision: { note: "looks good" } });
    const ev = stubs.spanEvents.find((e) => e.name === "hitl.task.decided");
    expect(ev?.attributes?.[CodemationTelemetryAttributeNames.hitlDecisionStatus]).toBe("decided");
  });

  it("tolerates a null decision payload when computing decisionStatus", async () => {
    const { handler, stubs } = makeStubs({ task: makeTask() });
    await handler.decide({ ...baseArgs, decision: null });
    const ev = stubs.spanEvents.find((e) => e.name === "hitl.task.decided");
    expect(ev?.attributes?.[CodemationTelemetryAttributeNames.hitlDecisionStatus]).toBe("decided");
  });
});

// ── validateResumeToken() branches ──────────────────────────────────────────────

describe("DecideHumanTaskCommandHandler.validateResumeToken", () => {
  it("throws 410 when the token is expired", async () => {
    const { handler } = makeStubs({ verifyResult: { ok: false, reason: "expired" } });
    await expect(handler.validateResumeToken({ taskId: "task-1", token: "t" })).rejects.toMatchObject({ status: 410 });
  });

  it("throws 401 when the token signature is invalid", async () => {
    const { handler } = makeStubs({ verifyResult: { ok: false, reason: "bad_sig" } });
    await expect(handler.validateResumeToken({ taskId: "task-1", token: "t" })).rejects.toMatchObject({ status: 401 });
  });

  it("throws 401 when the token taskId does not match", async () => {
    const { handler } = makeStubs({
      verifyResult: { ok: true, taskId: "other", schemaHash: "abcdef01", expiresAt: new Date("2099-01-01") },
    });
    await expect(handler.validateResumeToken({ taskId: "task-1", token: "t" })).rejects.toMatchObject({ status: 401 });
  });

  it("throws 503 when the task store is not configured", async () => {
    const { handler } = makeStubs({
      storeUndefined: true,
      verifyResult: { ok: true, taskId: "task-1", schemaHash: "abcdef01", expiresAt: new Date("2099-01-01") },
    });
    await expect(handler.validateResumeToken({ taskId: "task-1", token: "t" })).rejects.toMatchObject({ status: 503 });
  });

  it("throws 404 when the task is not found", async () => {
    const { handler } = makeStubs({
      task: undefined,
      verifyResult: { ok: true, taskId: "task-1", schemaHash: "abcdef01", expiresAt: new Date("2099-01-01") },
    });
    await expect(handler.validateResumeToken({ taskId: "task-1", token: "t" })).rejects.toMatchObject({ status: 404 });
  });

  it("throws 410 when the schema hash has drifted since the token was issued", async () => {
    const { handler } = makeStubs({
      task: makeTask({ decisionSchemaHash: "ffffffff0000" }),
      verifyResult: { ok: true, taskId: "task-1", schemaHash: "abcdef01", expiresAt: new Date("2099-01-01") },
    });
    await expect(handler.validateResumeToken({ taskId: "task-1", token: "t" })).rejects.toMatchObject({ status: 410 });
  });

  it("returns the schemaHash when the token is valid and the schema is unchanged", async () => {
    const { handler } = makeStubs({
      task: makeTask({ decisionSchemaHash: "abcdef0199999" }),
      verifyResult: { ok: true, taskId: "task-1", schemaHash: "abcdef01", expiresAt: new Date("2099-01-01") },
    });
    await expect(handler.validateResumeToken({ taskId: "task-1", token: "t" })).resolves.toEqual({
      schemaHash: "abcdef01",
    });
  });
});
