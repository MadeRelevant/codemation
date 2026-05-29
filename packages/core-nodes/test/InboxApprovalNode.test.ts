/**
 * Unit tests for the inboxApproval node (Story 05).
 *
 * Coverage:
 * 1. First execute call throws SuspensionRequest; calling deliver() on the request
 *    routes to the resolved channel and returns the channel's delivery verbatim.
 * 2. Telemetry span event is tagged with the resolved channel kind.
 * 3. onDecision callback routes to the same resolver and calls updateOnDecision.
 * 4. onTimeout callback routes to the same resolver and calls updateOnTimeout.
 * 5. When no resolver is registered (ctx.resolve returns undefined), deliver throws
 *    a clear error.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type {
  InboxChannel,
  InboxChannelResolverSeam,
  InboxDeliverArgs,
  InboxDelivery,
  InboxOnDecisionArgs,
  InboxOnTimeoutArgs,
  Item,
  NodeExecutionContext,
  TelemetrySpanEventRecord,
  TypeToken,
} from "@codemation/core";
import { SuspensionRequest, InboxChannelResolverToken } from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";

import { inboxApproval } from "../src/nodes/InboxApprovalNode.types";

// ---------------------------------------------------------------------------
// Test stubs
// ---------------------------------------------------------------------------

/** Captures span events emitted by the node under test. */
class CapturingTelemetry {
  readonly events: TelemetrySpanEventRecord[] = [];

  addSpanEvent(args: TelemetrySpanEventRecord): void {
    this.events.push(args);
  }

  recordMetric(): void {}

  attachArtifact(): { artifactId: string } {
    return { artifactId: "no-op" };
  }

  readonly traceId = "00000000000000000000000000000000";
  readonly spanId = "0000000000000000";

  end(): void {}

  asNodeTelemetry(): this {
    return this;
  }

  forNode(): this {
    return this;
  }

  startChildSpan(): this {
    return this;
  }
}

class StubInboxChannel implements InboxChannel {
  readonly kind: "local" | "control-plane-inbox";
  readonly deliverCalls: InboxDeliverArgs[] = [];
  readonly onDecisionCalls: InboxOnDecisionArgs[] = [];
  readonly onTimeoutCalls: InboxOnTimeoutArgs[] = [];
  private readonly deliveryToReturn: InboxDelivery;

  constructor(kind: "local" | "control-plane-inbox", delivery: InboxDelivery) {
    this.kind = kind;
    this.deliveryToReturn = delivery;
  }

  async deliver(args: InboxDeliverArgs): Promise<InboxDelivery> {
    this.deliverCalls.push(args);
    return this.deliveryToReturn;
  }

  async updateOnDecision(args: InboxOnDecisionArgs): Promise<void> {
    this.onDecisionCalls.push(args);
  }

  async updateOnTimeout(args: InboxOnTimeoutArgs): Promise<void> {
    this.onTimeoutCalls.push(args);
  }
}

// ---------------------------------------------------------------------------
// Context + node factory for inboxApproval tests
//
// IMPORTANT: the RunnableNodeConfig returned by inboxApproval.create() has a
// nested `.config` property (the resolved static config). The DefinedNodeRuntime
// accesses `ctx.config.config` to get the static config. We must pass the
// RunnableNodeConfig as `ctx.config`, not the flat config object.
// ---------------------------------------------------------------------------

type InboxSubjectField = string | ((args: { item: Item }) => string);

function makeNodeAndCtx(opts: {
  resolver: InboxChannelResolverSeam | undefined;
  telemetry?: CapturingTelemetry;
  title?: InboxSubjectField;
  body?: InboxSubjectField;
}) {
  const nodeConfig = inboxApproval.create(
    {
      name: "Inbox Approval",
      title: opts.title ?? (({ item }) => `Approve: ${(item.json as { invoiceId?: unknown }).invoiceId}`),
      body: opts.body ?? (({ item }) => `Invoice ${(item.json as { invoiceId?: unknown }).invoiceId} needs review.`),
      priority: "normal",
      timeout: "24h",
      onTimeout: "halt",
    },
    "inbox_1",
  );
  const NodeClass = nodeConfig.type as new () => { execute: (args: any) => Promise<unknown> };
  const node = new NodeClass();

  const binary = new DefaultExecutionBinaryService(new InMemoryBinaryStorage(), "wf_1", "run_1", () => new Date());
  const telemetry = opts.telemetry ?? new CapturingTelemetry();

  const ctx: NodeExecutionContext<typeof nodeConfig> = {
    runId: "run_1",
    workflowId: "wf_1",
    parent: undefined,
    subworkflowDepth: 0,
    engineMaxNodeActivations: 100,
    engineMaxSubworkflowDepth: 10,
    now: () => new Date(),
    data: new InMemoryRunDataFactory().create(),
    nodeId: "node_inbox",
    activationId: "act_inbox",
    config: nodeConfig,
    binary: binary.forNode({ nodeId: "node_inbox", activationId: "act_inbox" }),
    telemetry: telemetry as any,
    getCredential: async () => "" as any,
    resolve: <T>(token: TypeToken<T>): T => {
      if (token === InboxChannelResolverToken) {
        return opts.resolver as unknown as T;
      }
      throw new Error(`Unexpected token in test ctx.resolve: ${String(token)}`);
    },
  };

  return { node, nodeConfig, ctx, telemetry };
}

function makeHandle() {
  return {
    taskId: "task_1",
    runId: "run_1",
    nodeId: "node_inbox",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    resumeUrl: "",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("inboxApproval node — deliver (first execute)", () => {
  test("throws SuspensionRequest on first call; deliver() routes to the resolved channel", async () => {
    const channel = new StubInboxChannel("local", { kind: "local", inboxItemId: "inbox-42" });
    const resolver: InboxChannelResolverSeam = { resolve: () => ({ channel }) };
    const { node, nodeConfig, ctx } = makeNodeAndCtx({ resolver });
    const item = { json: { invoiceId: "INV-001" } };

    let thrown: SuspensionRequest | undefined;
    try {
      await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });
    } catch (e) {
      if (e instanceof SuspensionRequest) thrown = e;
      else throw e;
    }

    assert.ok(thrown, "execute() must throw a SuspensionRequest on first call");

    // Now invoke deliver() to simulate what the engine does after persisting the suspension.
    const delivery = await thrown.request.deliver(makeHandle());

    assert.deepEqual(delivery, { kind: "local", inboxItemId: "inbox-42" });
    assert.equal(channel.deliverCalls.length, 1);
    assert.equal(channel.deliverCalls[0]?.priority, nodeConfig.config.priority);
  });

  test("deliver() passes workspaceId from resolver through to channel.deliver", async () => {
    const channel = new StubInboxChannel("control-plane-inbox", {
      kind: "cp",
      inboxItemId: "cp-99",
      workspaceId: "ws_managed",
    });
    const resolver: InboxChannelResolverSeam = {
      resolve: () => ({ channel, workspaceId: "ws_managed" }),
    };
    const { node, ctx } = makeNodeAndCtx({ resolver });
    const item = { json: {} };

    let thrown: SuspensionRequest | undefined;
    try {
      await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });
    } catch (e) {
      if (e instanceof SuspensionRequest) thrown = e;
      else throw e;
    }

    assert.ok(thrown);
    await thrown.request.deliver(makeHandle());

    assert.equal(channel.deliverCalls[0]?.workspaceId, "ws_managed");
  });

  test("deliver() emits telemetry span event with channel kind attribute", async () => {
    const channel = new StubInboxChannel("local", { kind: "local", inboxItemId: "inbox-1" });
    const resolver: InboxChannelResolverSeam = { resolve: () => ({ channel }) };
    const telemetry = new CapturingTelemetry();
    const { node, ctx } = makeNodeAndCtx({ resolver, telemetry });
    const item = { json: {} };

    let thrown: SuspensionRequest | undefined;
    try {
      await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });
    } catch (e) {
      if (e instanceof SuspensionRequest) thrown = e;
      else throw e;
    }

    assert.ok(thrown);
    await thrown.request.deliver(makeHandle());

    const deliveredEvent = telemetry.events.find((e) => e.name === "hitl.task.delivered");
    assert.ok(deliveredEvent, "should emit hitl.task.delivered span event");
    assert.equal(deliveredEvent?.attributes?.["channel"], "local");
  });

  test("deliver() throws a clear error when no resolver is registered", async () => {
    const { node, ctx } = makeNodeAndCtx({ resolver: undefined });
    const item = { json: {} };

    let thrown: SuspensionRequest | undefined;
    try {
      await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });
    } catch (e) {
      if (e instanceof SuspensionRequest) thrown = e;
      else throw e;
    }

    assert.ok(thrown);
    await assert.rejects(() => thrown!.request.deliver(makeHandle()), /no InboxChannelResolver registered/);
  });
});

describe("inboxApproval node — onDecision (resume)", () => {
  test("onDecision routes to resolver and calls channel.updateOnDecision", async () => {
    const delivery: InboxDelivery = { kind: "local", inboxItemId: "inbox-42" };
    const channel = new StubInboxChannel("local", delivery);
    const resolver: InboxChannelResolverSeam = { resolve: () => ({ channel }) };
    const { node, ctx } = makeNodeAndCtx({ resolver });
    ctx.resumeContext = {
      decision: {
        kind: "decided",
        value: { approved: true, note: "LGTM" },
        actor: { actorId: "u1" },
        decidedAt: new Date(),
      },
      delivery: delivery as any,
      task: makeHandle(),
    };
    const item = { json: { invoiceId: "INV-002" } };

    // Should NOT throw — returns the merged decision output item
    const result = await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });

    assert.ok(result, "should return a result on resume");
    assert.equal(channel.onDecisionCalls.length, 1);
    assert.equal(channel.onDecisionCalls[0]?.decision.approved, true);
  });

  test("onDecision is a no-op when resolver returns null", async () => {
    const { node, ctx } = makeNodeAndCtx({ resolver: undefined });
    ctx.resumeContext = {
      decision: { kind: "decided", value: { approved: false }, actor: { actorId: "u2" }, decidedAt: new Date() },
      delivery: { kind: "local", inboxItemId: "x" } as any,
      task: makeHandle(),
    };
    const item = { json: {} };

    // Should complete without error (resolver guard returns early when resolver is undefined)
    const result = await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });
    assert.ok(result);
  });
});

describe("inboxApproval node — onTimeout (resume)", () => {
  test("onTimeout routes to resolver and calls channel.updateOnTimeout", async () => {
    const delivery: InboxDelivery = { kind: "local", inboxItemId: "inbox-42" };
    const channel = new StubInboxChannel("local", delivery);
    const resolver: InboxChannelResolverSeam = { resolve: () => ({ channel }) };
    const { node, ctx } = makeNodeAndCtx({ resolver });
    ctx.resumeContext = {
      decision: { kind: "timed_out", at: new Date() },
      delivery: delivery as any,
      task: makeHandle(),
    };
    const item = { json: {} };

    await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });

    assert.equal(channel.onTimeoutCalls.length, 1);
    assert.equal(channel.onTimeoutCalls[0]?.policy, "halt");
  });
});
