/**
 * Unit tests for Story 04: defineHumanApprovalNode authoring API.
 *
 * Tests exercise:
 * - First pass throws SuspensionRequest with the correct shape.
 * - Resume with decided / approved → output has decision.status "approved".
 * - Resume with decided / rejected → output has decision.status "rejected".
 * - Resume with timed_out → decision.status "timed-out".
 * - Resume with auto_accepted → decision.status "auto-accepted".
 * - binary is passed through by reference.
 * - Existing item.json.decision is overwritten.
 * - onDecision is called exactly once on a "decided" resume.
 * - onTimeout is called for both "timed_out" and "auto_accepted".
 * - decisionSchema mismatch on parse throws.
 * - No approvedPredicate + no approved field → definition-time throw.
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { HumanTaskHandle, NodeExecutionContext, ResumeContext } from "../../src/contracts/runtimeTypes";
import { SuspensionRequest } from "../../src/contracts/runtimeTypes";
import type { Item } from "../../src/contracts/workflowTypes";
import { defineHumanApprovalNode } from "../../src/authoring/defineHumanApprovalNode.types";
import type { RunnableNode, RunnableNodeExecuteArgs } from "../../src/contracts/runtimeTypes";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const decisionSchema = z.object({ approved: z.boolean(), note: z.string().optional() });

/**
 * Create a minimal approval node with sensible defaults and merge in any overrides.
 */
function makeNode(overrides: Parameters<typeof defineHumanApprovalNode>[0] = {} as never) {
  return defineHumanApprovalNode({
    key: "test.approvalNode",
    title: "Test Approval",
    channel: "test-channel",
    configSchema: z.object({}),
    decisionSchema,
    async deliver({ task }) {
      return { taskId: task.taskId };
    },
    ...overrides,
  });
}

/**
 * Build a fake NodeExecutionContext with optional resumeContext.
 */
function makeCtx(resumeContext?: ResumeContext): NodeExecutionContext<Record<string, unknown>> {
  return {
    config: { kind: "node", type: {}, config: {}, name: "test", getCredentialRequirements: () => [] },
    nodeId: "node_1",
    activationId: "act_1",
    runId: "run_1",
    workflowId: "wf_1",
    subworkflowDepth: 0,
    engineMaxNodeActivations: 10_000,
    engineMaxSubworkflowDepth: 32,
    now: () => new Date(),
    data: { completedNodeOutputs: {} },
    binary: {} as never,
    telemetry: {} as never,
    getCredential: async () => undefined,
    resumeContext,
  } as unknown as NodeExecutionContext<Record<string, unknown>>;
}

/**
 * Create a minimal Item for tests.
 */
function makeItem(json: Record<string, unknown> = { invoiceId: 42 }, binary?: Item["binary"]): Item {
  return { json, binary };
}

const fakeHandle: HumanTaskHandle = {
  taskId: "htask_1",
  runId: "run_1",
  nodeId: "node_1",
  expiresAt: new Date("2099-01-01T00:00:00Z"),
  resumeUrl: "",
};

const fakeActor = { actorId: "user_1", displayName: "Alice" };

/**
 * Execute the synthesized RunnableNode from a defineHumanApprovalNode result.
 * Returns the raw value from runtime.execute so tests can inspect both the
 * item shape (binary pass-through) and the json payload.
 */
async function runExecute(
  node: ReturnType<typeof makeNode>,
  args: { item: Item; ctx: NodeExecutionContext<Record<string, unknown>> },
): Promise<{ json: Record<string, unknown>; binary?: Item["binary"]; meta?: Item["meta"] }> {
  const config = node.create({});
  const runtime = new (config.type as new () => RunnableNode<typeof config>)();
  const result = await runtime.execute({
    input: args.item.json,
    item: args.item,
    itemIndex: 0,
    items: [args.item],
    ctx: args.ctx,
  } as unknown as RunnableNodeExecuteArgs<typeof config, unknown>);
  // On resume, execute returns an Item-shaped object { json, binary, meta }.
  return result as { json: Record<string, unknown>; binary?: Item["binary"]; meta?: Item["meta"] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("defineHumanApprovalNode", () => {
  describe("first pass (no resumeContext)", () => {
    it("throws SuspensionRequest with the correct shape", async () => {
      const node = makeNode();
      const item = makeItem();
      const ctx = makeCtx();

      await expect(runExecute(node, { item, ctx })).rejects.toBeInstanceOf(SuspensionRequest);
    });

    it("SuspensionRequest carries channel metadata and decisionSchema", async () => {
      const node = makeNode();
      const item = makeItem();
      const ctx = makeCtx();

      let caught: SuspensionRequest | undefined;
      try {
        await runExecute(node, { item, ctx });
      } catch (err) {
        if (err instanceof SuspensionRequest) caught = err;
      }

      expect(caught).toBeDefined();
      expect(caught!.request.metadata?.["channel"]).toBe("test-channel");
      expect(caught!.request.metadata?.["nodeKey"]).toBe("test.approvalNode");
      expect(caught!.request.decisionSchema).toBe(decisionSchema);
      expect(caught!.request.timeout).toBe("24h");
      expect(caught!.request.onTimeout).toBe("halt");
    });

    it("SuspensionRequest deliver wraps the author's deliver callback", async () => {
      let deliveredHandle: HumanTaskHandle | undefined;
      const node = makeNode({
        async deliver({ task }) {
          deliveredHandle = task;
          return { ts: "T001" };
        },
      });
      const item = makeItem();
      const ctx = makeCtx();

      let caught: SuspensionRequest | undefined;
      try {
        await runExecute(node, { item, ctx });
      } catch (err) {
        if (err instanceof SuspensionRequest) caught = err;
      }

      // Invoke the deliver callback as the engine would.
      const result = await caught!.request.deliver(fakeHandle);
      expect(deliveredHandle).toBe(fakeHandle);
      expect(result).toEqual({ ts: "T001" });
    });

    it("respects custom defaultTimeout and defaultOnTimeout", async () => {
      const node = makeNode({ defaultTimeout: "PT2H", defaultOnTimeout: "auto-accept" });
      const ctx = makeCtx();

      let caught: SuspensionRequest | undefined;
      try {
        await runExecute(node, { item: makeItem(), ctx });
      } catch (err) {
        if (err instanceof SuspensionRequest) caught = err;
      }

      expect(caught!.request.timeout).toBe("PT2H");
      expect(caught!.request.onTimeout).toBe("auto-accept");
    });
  });

  describe("resume pass — decided", () => {
    it("status 'approved' when approved: true and original json preserved", async () => {
      const node = makeNode();
      const item = makeItem({ invoiceId: 42, amount: 5000 });
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: { taskId: "htask_1" },
        decision: {
          kind: "decided",
          value: { approved: true },
          actor: fakeActor,
          decidedAt: new Date("2025-01-01T12:00:00Z"),
        },
      };

      const out = await runExecute(node, { item, ctx: makeCtx(resume) });
      expect(out.json["invoiceId"]).toBe(42);
      expect(out.json["amount"]).toBe(5000);
      expect((out.json["decision"] as { status: string }).status).toBe("approved");
      expect((out.json["decision"] as { actor: unknown }).actor).toEqual(fakeActor);
    });

    it("status 'rejected' when approved: false", async () => {
      const node = makeNode();
      const item = makeItem({ invoiceId: 7 });
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: { taskId: "htask_1" },
        decision: {
          kind: "decided",
          value: { approved: false },
          actor: fakeActor,
          decidedAt: new Date(),
        },
      };

      const out = await runExecute(node, { item, ctx: makeCtx(resume) });
      expect((out.json["decision"] as { status: string }).status).toBe("rejected");
    });

    it("uses custom approvedPredicate", async () => {
      const nodeWithPredicate = defineHumanApprovalNode({
        key: "test.customPredicate",
        title: "Custom Predicate",
        channel: "test",
        configSchema: z.object({}),
        decisionSchema: z.object({ action: z.enum(["approve", "reject"]) }),
        approvedPredicate: (d) => d.action === "approve",
        async deliver({ task }) {
          return { taskId: task.taskId };
        },
      });

      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: {
          kind: "decided",
          value: { action: "approve" },
          actor: fakeActor,
          decidedAt: new Date(),
        },
      };

      const config = nodeWithPredicate.create({});
      const runtime = new (config.type as new () => RunnableNode<typeof config>)();
      const out = (await runtime.execute({
        input: {},
        item: makeItem(),
        itemIndex: 0,
        items: [makeItem()],
        ctx: makeCtx(resume),
      } as unknown as RunnableNodeExecuteArgs<typeof config, unknown>)) as { json: Record<string, unknown> };

      expect((out.json["decision"] as { status: string }).status).toBe("approved");
    });

    it("onDecision is called exactly once", async () => {
      const onDecision = vi.fn().mockResolvedValue(undefined);
      const node = makeNode({ onDecision });
      const item = makeItem();
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: { kind: "decided", value: { approved: true }, actor: fakeActor, decidedAt: new Date() },
      };

      await runExecute(node, { item, ctx: makeCtx(resume) });
      expect(onDecision).toHaveBeenCalledTimes(1);
      expect(onDecision.mock.calls[0][0]).toMatchObject({
        decision: { approved: true },
        actor: fakeActor,
        task: fakeHandle,
        item,
      });
    });

    it("onTimeout is NOT called on a decided resume", async () => {
      const onTimeout = vi.fn().mockResolvedValue(undefined);
      const node = makeNode({ onTimeout });
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: { kind: "decided", value: { approved: true }, actor: fakeActor, decidedAt: new Date() },
      };

      await runExecute(node, { item: makeItem(), ctx: makeCtx(resume) });
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it("decisionSchema mismatch throws a Zod error", async () => {
      const node = makeNode();
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: {
          kind: "decided",
          value: { approved: "not-a-boolean" }, // invalid
          actor: fakeActor,
          decidedAt: new Date(),
        },
      };

      await expect(runExecute(node, { item: makeItem(), ctx: makeCtx(resume) })).rejects.toThrow();
    });

    it("overwrites existing item.json.decision without error", async () => {
      const node = makeNode();
      const item = makeItem({ invoiceId: 1, decision: { status: "old" } });
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: { kind: "decided", value: { approved: true }, actor: fakeActor, decidedAt: new Date() },
      };

      const out = await runExecute(node, { item, ctx: makeCtx(resume) });
      expect((out.json["decision"] as { status: string }).status).toBe("approved");
    });
  });

  describe("resume pass — timed_out", () => {
    it("status 'timed-out'", async () => {
      const node = makeNode();
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: { kind: "timed_out", at: new Date() },
      };

      const out = await runExecute(node, { item: makeItem(), ctx: makeCtx(resume) });
      expect((out.json["decision"] as { status: string }).status).toBe("timed-out");
    });

    it("onTimeout is called with policy 'halt'", async () => {
      const onTimeout = vi.fn().mockResolvedValue(undefined);
      const node = makeNode({ onTimeout });
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: { ref: "x" },
        decision: { kind: "timed_out", at: new Date() },
      };

      await runExecute(node, { item: makeItem(), ctx: makeCtx(resume) });
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout.mock.calls[0][0]).toMatchObject({ policy: "halt" });
    });

    it("onDecision is NOT called on timed_out", async () => {
      const onDecision = vi.fn().mockResolvedValue(undefined);
      const node = makeNode({ onDecision });
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: { kind: "timed_out", at: new Date() },
      };

      await runExecute(node, { item: makeItem(), ctx: makeCtx(resume) });
      expect(onDecision).not.toHaveBeenCalled();
    });
  });

  describe("resume pass — auto_accepted", () => {
    it("status 'auto-accepted'", async () => {
      const node = makeNode();
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: { kind: "auto_accepted", at: new Date() },
      };

      const out = await runExecute(node, { item: makeItem(), ctx: makeCtx(resume) });
      expect((out.json["decision"] as { status: string }).status).toBe("auto-accepted");
    });

    it("onTimeout is called with policy 'auto-accept'", async () => {
      const onTimeout = vi.fn().mockResolvedValue(undefined);
      const node = makeNode({ onTimeout });
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: { kind: "auto_accepted", at: new Date() },
      };

      await runExecute(node, { item: makeItem(), ctx: makeCtx(resume) });
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout.mock.calls[0][0]).toMatchObject({ policy: "auto-accept" });
    });
  });

  describe("binary pass-through", () => {
    it("binary is passed through by reference (not copied)", async () => {
      const node = makeNode();
      const binary: Item["binary"] = {
        attachment: {
          id: "att_1",
          storageKey: "k",
          mimeType: "image/png",
          size: 1024,
          storageDriver: "local",
          previewKind: "image",
          createdAt: new Date().toISOString(),
          runId: "run_1",
          workflowId: "wf_1",
          nodeId: "node_1",
          activationId: "act_1",
        },
      };
      const item = makeItem({ x: 1 }, binary);
      const resume: ResumeContext = {
        task: fakeHandle,
        delivery: {},
        decision: { kind: "decided", value: { approved: true }, actor: fakeActor, decidedAt: new Date() },
      };

      const out = await runExecute(node, { item, ctx: makeCtx(resume) });
      // Same reference — no copy.
      expect(out.binary).toBe(binary);
    });
  });

  describe("definition-time validation", () => {
    it("throws when decisionSchema has no approved field and no approvedPredicate", () => {
      expect(() =>
        defineHumanApprovalNode({
          key: "test.noApproved",
          title: "No approved",
          channel: "test",
          configSchema: z.object({}),
          decisionSchema: z.object({ action: z.string() }), // no 'approved'
          async deliver({ task }) {
            return { taskId: task.taskId };
          },
        }),
      ).toThrow(/approvedPredicate/);
    });

    it("does NOT throw when approvedPredicate is provided and schema has no approved field", () => {
      expect(() =>
        defineHumanApprovalNode({
          key: "test.predicateProvided",
          title: "Predicate provided",
          channel: "test",
          configSchema: z.object({}),
          decisionSchema: z.object({ action: z.string() }),
          approvedPredicate: (d) => d.action === "yes",
          async deliver({ task }) {
            return { taskId: task.taskId };
          },
        }),
      ).not.toThrow();
    });

    it("attaches humanApprovalToolBehavior marker", () => {
      const node = makeNode();
      expect(node.humanApprovalToolBehavior).toBe("return");
    });
  });
});
