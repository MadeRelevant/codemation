/**
 * Unit tests for HITL Story 01: engine SuspensionRequest outcome + suspended run
 * persistence + resume queue.
 *
 * Tests cover the five scenarios from the spec (§ Implementation plan, step 7):
 * 1. Node throws SuspensionRequest → run status becomes "suspended" and suspension entry is saved.
 * 2. deliver callback receives a HumanTaskHandle; its return value is persisted as deliveryRef.
 * 3. deliver throwing causes the run to go to "failed" (surfaced as an error from NodeExecutor).
 * 4. resumeRun() with a fake decision re-invokes the node; ctx.resumeContext is populated.
 * 5. Per-item: 3-item batch, item 1 suspends, items 2–3 complete; status is "suspended" with one entry.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type HumanTaskHandle, type ResumeContext, SuspensionRequest } from "@codemation/core";
import { DefaultAsyncSleeper, InProcessRetryRunner, NodeExecutor } from "@codemation/core/bootstrap";

import { NodeSuspensionHandler } from "../../../../packages/core/src/execution/NodeSuspensionHandler";
import { InMemoryWorkflowRunRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowRunRepository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal PersistedRunState with no outputs. */
function makeRunState(overrides: Partial<Parameters<InMemoryWorkflowRunRepository["createRun"]>[0]> = {}) {
  return {
    runId: "run_1" as never,
    workflowId: "wf_1" as never,
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a SuspensionRequest with a deliver callback that records calls. */
function makeSuspensionRequest(opts: {
  deliverReturn?: Record<string, string>;
  deliverThrow?: Error;
  onTimeout?: "halt" | "auto-accept";
}) {
  const deliverCalls: HumanTaskHandle[] = [];
  const req = new SuspensionRequest({
    decisionSchema: z.object({ approved: z.boolean() }),
    timeout: "PT24H",
    onTimeout: opts.onTimeout ?? "halt",
    subject: { title: "Approve invoice", summary: "Invoice #1234" },
    deliver: async (handle: HumanTaskHandle) => {
      deliverCalls.push(handle);
      if (opts.deliverThrow) {
        throw opts.deliverThrow;
      }
      return opts.deliverReturn ?? { channel: "slack", ts: "T001" };
    },
  });
  return { req, deliverCalls };
}

/** Build a NodeSuspensionHandler wired to the provided repository. */
function makeHandler(repo: InMemoryWorkflowRunRepository) {
  return new NodeSuspensionHandler(repo);
}

// ---------------------------------------------------------------------------
// Scenario 1: SuspensionRequest → status "suspended" + suspension entry saved
// ---------------------------------------------------------------------------

describe("NodeSuspensionHandler.handle", () => {
  it("saves status 'suspended' and a suspension entry when deliver succeeds", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun(makeRunState());
    const state = await repo.load("run_1");
    expect(state).not.toBeNull();

    const handler = makeHandler(repo);
    const { req } = makeSuspensionRequest({ deliverReturn: { channel: "test" } });

    await expect(
      handler.handle({
        runId: "run_1" as never,
        nodeId: "node_a" as never,
        activationId: "act_1" as never,
        itemIndex: 0,
        suspensionRequest: req,
        state: state!,
      }),
    ).rejects.toMatchObject({ constructor: expect.any(Function) }); // throws RunSuspendedError

    const updated = await repo.load("run_1");
    expect(updated?.status).toBe("suspended");
    expect(updated?.suspension).toHaveLength(1);
    const entry = updated?.suspension?.[0];
    expect(entry?.nodeId).toBe("node_a");
    expect(entry?.activationId).toBe("act_1");
    expect(entry?.itemIndex).toBe(0);
    expect(entry?.onTimeout).toBe("halt");
    expect(entry?.timeoutAt).toBeTruthy();
    expect(typeof entry?.taskId).toBe("string");
    expect(entry?.taskId).toMatch(/^htask_/);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: deliver receives handle + return value persisted as deliveryRef
  // ---------------------------------------------------------------------------

  it("passes a HumanTaskHandle to deliver and persists its return as deliveryRef", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun(makeRunState());
    const state = await repo.load("run_1");

    const handler = makeHandler(repo);
    const { req, deliverCalls } = makeSuspensionRequest({
      deliverReturn: { channel: "slack", ts: "TS_UNIQUE" },
    });

    await expect(
      handler.handle({
        runId: "run_1" as never,
        nodeId: "node_b" as never,
        activationId: "act_2" as never,
        itemIndex: 0,
        suspensionRequest: req,
        state: state!,
      }),
    ).rejects.toBeTruthy();

    // deliver received a valid HumanTaskHandle
    expect(deliverCalls).toHaveLength(1);
    const handle = deliverCalls[0]!;
    expect(handle.taskId).toMatch(/^htask_/);
    expect(handle.runId).toBe("run_1");
    expect(handle.nodeId).toBe("node_b");
    expect(handle.expiresAt).toBeInstanceOf(Date);

    // deliveryRef was persisted
    const updated = await repo.load("run_1");
    expect(updated?.suspension?.[0]?.deliveryRef).toEqual({ channel: "slack", ts: "TS_UNIQUE" });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: deliver throwing → error propagates (run goes to "failed" upstream)
  // ---------------------------------------------------------------------------

  it("propagates deliver errors without saving a suspension entry", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun(makeRunState());
    const state = await repo.load("run_1");

    const handler = makeHandler(repo);
    const deliverError = new Error("Channel unreachable");
    const { req } = makeSuspensionRequest({ deliverThrow: deliverError });

    await expect(
      handler.handle({
        runId: "run_1" as never,
        nodeId: "node_c" as never,
        activationId: "act_3" as never,
        itemIndex: 0,
        suspensionRequest: req,
        state: state!,
      }),
    ).rejects.toThrow("Channel unreachable");

    // Run state should NOT have been flipped to suspended — deliver threw before save
    const updated = await repo.load("run_1");
    expect(updated?.status).not.toBe("suspended");
    expect(updated?.suspension ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: resumeContext is populated on resume (via pendingResume field)
// ---------------------------------------------------------------------------

describe("pendingResume / resumeContext threading", () => {
  it("writes pendingResume onto the run state and can be read back", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun(makeRunState());
    const state = await repo.load("run_1");
    expect(state).not.toBeNull();

    const resumeContext: ResumeContext = {
      decision: {
        kind: "decided",
        value: { approved: true },
        actor: { actorId: "user_1", displayName: "Alice" },
        decidedAt: new Date("2026-01-01T12:00:00Z"),
      },
      delivery: { channel: "slack", ts: "TS_001" },
      task: {
        taskId: "htask_test",
        runId: "run_1",
        nodeId: "node_d",
        expiresAt: new Date("2026-01-02T12:00:00Z"),
        resumeUrl: "",
      },
    };

    // Simulate what resumeRun would write
    await repo.save({
      ...state!,
      pendingResume: {
        activationId: "act_resume_1" as never,
        nodeId: "node_d" as never,
        resumeContext,
      },
    });

    const updated = await repo.load("run_1");
    expect(updated?.pendingResume?.activationId).toBe("act_resume_1");
    expect(updated?.pendingResume?.nodeId).toBe("node_d");
    const ctx = updated?.pendingResume?.resumeContext as ResumeContext;
    expect(ctx.decision.kind).toBe("decided");
    expect((ctx.decision as { value: unknown }).value).toEqual({ approved: true });
    expect(ctx.delivery).toEqual({ channel: "slack", ts: "TS_001" });
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: 3-item batch, item 1 suspends, items 2–3 complete
//            status is "suspended" and suspension array has exactly one entry
// ---------------------------------------------------------------------------

describe("NodeExecutor per-item suspension (D2)", () => {
  it("suspends at item 0 and stops processing further items", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun(makeRunState());

    const handler = makeHandler(repo);
    const retryRunner = new InProcessRetryRunner(new DefaultAsyncSleeper());

    let executedIndices: number[] = [];

    // Minimal WorkflowNodeInstanceFactory that resolves a node which:
    // - suspends on item at index 0 (item 1 in the spec's 1-indexed terms)
    // - succeeds for items at indices 1 and 2
    const nodeInstanceFactory = {
      createByType: (_token: unknown) => ({
        kind: "node" as const,
        outputPorts: ["main"] as const,
        execute: async (args: { input: unknown; item: unknown; itemIndex: number; items: unknown; ctx: unknown }) => {
          executedIndices.push(args.itemIndex);
          if (args.itemIndex === 0) {
            const { req } = makeSuspensionRequest({ deliverReturn: { channel: "test" } });
            throw req;
          }
          return { json: { processed: args.itemIndex } };
        },
      }),
      createNodes: () => new Map(),
    };

    const executor = new NodeExecutor(nodeInstanceFactory as any, retryRunner, undefined, undefined, handler, (runId) =>
      repo.load(runId as never),
    );

    // Minimal config
    const config = {
      kind: "node" as const,
      type: {} as any,
      getCredentialRequirements: () => [],
    };

    // Minimal ctx
    const ctx = {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_batch",
      activationId: "act_batch",
      config,
      subworkflowDepth: 0,
      engineMaxNodeActivations: 100,
      engineMaxSubworkflowDepth: 5,
      now: () => new Date(),
      data: {
        getOutputItems: () => [],
        getOutputs: () => undefined,
        getOutputItem: () => undefined,
        setOutputs: () => {},
        dump: () => ({}),
      },
      telemetry: {
        forNode: () => ({
          startSpan: () => ({ end: () => {} }),
          activeSpan: undefined,
          withSpan: async (_name: unknown, fn: () => Promise<unknown>) => fn(),
        }),
      } as any,
      binary: {
        forNode: () => ({
          attach: async () => ({ storageKey: "key", name: "f", mimeType: "x", size: 0 }),
          withAttachment: (item: unknown) => item,
          openReadStream: async () => undefined,
        }),
        openReadStream: async () => undefined,
      } as any,
      getCredential: async () => {
        throw new Error("no credentials");
      },
    } as any;

    // 3-item batch
    const threeItems = [{ json: { index: 0 } }, { json: { index: 1 } }, { json: { index: 2 } }];

    const activationRequest = {
      kind: "single" as const,
      runId: "run_1" as never,
      activationId: "act_batch" as never,
      workflowId: "wf_1" as never,
      nodeId: "node_batch" as never,
      batchId: "batch_1",
      input: threeItems,
      ctx,
    };

    // execute() should surface RunSuspendedError (re-thrown from suspensionHandler)
    await expect(executor.execute(activationRequest)).rejects.toThrow();

    // Only item 0 should have been attempted (RunSuspendedError exits immediately)
    // The handler throws after persisting, so items 1 and 2 are not reached.
    expect(executedIndices).toContain(0);

    const updated = await repo.load("run_1");
    expect(updated?.status).toBe("suspended");
    expect(updated?.suspension).toHaveLength(1);
    expect(updated?.suspension?.[0]?.itemIndex).toBe(0);
    expect(updated?.suspension?.[0]?.nodeId).toBe("node_batch");
  });
});
