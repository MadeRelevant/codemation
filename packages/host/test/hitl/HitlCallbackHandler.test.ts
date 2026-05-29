// @vitest-environment node

/**
 * Unit tests for HitlCallbackHandler branch coverage.
 *
 * Covers each outcome of the inbound CP callback handler: 503 (no store),
 * 404 (task not found), 403 (workspace mismatch), 409 (not pending), the
 * timeout body path (markTimedOut + 200), the decision delegation path
 * (explicit actor + fallback cp-reviewer actor), ApplicationRequestError
 * mapping from the delegate, and rethrow of non-ApplicationRequestError.
 *
 * Hand-built stubs (no DI container / DB), following HitlTelemetrySpans.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import type { HumanTaskRecord } from "@codemation/core";
import { HitlCallbackHandler } from "../../src/application/hitl/HitlCallbackHandler";
import { ApplicationRequestError } from "../../src/application/ApplicationRequestError";

const WORKSPACE_ID = "ws-1";

function makeTask(overrides: Partial<HumanTaskRecord> = {}): HumanTaskRecord {
  return {
    id: "task-1",
    runId: "run-1",
    workflowId: "wf-1",
    workspaceId: WORKSPACE_ID,
    nodeId: "approval",
    activationId: "act-1",
    itemIndex: 0,
    status: "pending",
    channel: "inbox",
    subject: { title: "Approve", summary: "" },
    metadata: {},
    decisionSchemaJson: "{}",
    decisionSchemaHash: "abc",
    onTimeout: "halt",
    resumeTokenHash: "tok",
    expiresAt: new Date("2099-01-01"),
    createdAt: new Date(),
    deliveryRef: null,
    ...overrides,
  };
}

function makeNoopLoggerFactory() {
  const noop = () => {};
  return { create: () => ({ info: noop, debug: noop, warn: noop, error: noop }) };
}

function makeHandler(
  opts: {
    task?: HumanTaskRecord | undefined;
    storeUndefined?: boolean;
    decideThrow?: unknown;
  } = {},
): {
  handler: HitlCallbackHandler;
  store: { findById: ReturnType<typeof vi.fn>; markTimedOut: ReturnType<typeof vi.fn> } | undefined;
  decide: ReturnType<typeof vi.fn>;
} {
  const store = opts.storeUndefined
    ? undefined
    : { findById: vi.fn(async () => opts.task), markTimedOut: vi.fn(async () => {}) };
  const decide = vi.fn(async () => {
    if (opts.decideThrow !== undefined) throw opts.decideThrow;
    return { status: "decided" as const, runStatus: "running" as const };
  });
  const decideHandler = { decide };
  const pairingConfig = { workspaceId: WORKSPACE_ID, pairingSecret: "s", controlPlaneUrl: "http://cp" };

  const handler = new HitlCallbackHandler(
    store as never,
    pairingConfig as never,
    decideHandler as never,
    makeNoopLoggerFactory() as never,
  );
  return { handler, store, decide };
}

describe("HitlCallbackHandler.handle", () => {
  it("returns 503 when the task store is not configured", async () => {
    const { handler } = makeHandler({ storeUndefined: true });
    const res = await handler.handle("task-1", { kind: "timeout" });
    expect(res.status).toBe(503);
  });

  it("returns 404 when the task is not found", async () => {
    const { handler } = makeHandler({ task: undefined });
    const res = await handler.handle("task-1", { kind: "timeout" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the task workspace does not match the pairing config", async () => {
    const { handler } = makeHandler({ task: makeTask({ workspaceId: "ws-other" }) });
    const res = await handler.handle("task-1", { kind: "timeout" });
    expect(res.status).toBe(403);
  });

  it("returns 409 when the task is no longer pending", async () => {
    const { handler } = makeHandler({ task: makeTask({ status: "decided" }) });
    const res = await handler.handle("task-1", { kind: "timeout" });
    expect(res.status).toBe(409);
  });

  it("marks the task timed out and returns 200 for the timeout body", async () => {
    const { handler, store } = makeHandler({ task: makeTask() });
    const res = await handler.handle("task-1", { kind: "timeout" });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(store!.markTimedOut).toHaveBeenCalledWith("task-1");
  });

  it("delegates to decide() with the supplied actor and returns 200", async () => {
    const { handler, decide } = makeHandler({ task: makeTask() });
    const res = await handler.handle("task-1", {
      decision: { approved: true },
      actor: { actorId: "reviewer-7", displayName: "Rev" },
    });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task-1", decidedBy: { actorId: "reviewer-7", displayName: "Rev" } }),
    );
  });

  it("falls back to the cp-reviewer actor when none is supplied", async () => {
    const { handler, decide } = makeHandler({ task: makeTask() });
    await handler.handle("task-1", { decision: { approved: true } });
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ decidedBy: { actorId: "cp-reviewer" } }));
  });

  it("maps an ApplicationRequestError from decide() to the matching status", async () => {
    const { handler } = makeHandler({
      task: makeTask(),
      decideThrow: new ApplicationRequestError(422, "Decision does not match the expected schema"),
    });
    const res = await handler.handle("task-1", { decision: { approved: true } });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: "Decision does not match the expected schema" });
  });

  it("rethrows a non-ApplicationRequestError from decide()", async () => {
    const { handler } = makeHandler({ task: makeTask(), decideThrow: new Error("boom") });
    await expect(handler.handle("task-1", { decision: { approved: true } })).rejects.toThrow("boom");
  });
});
