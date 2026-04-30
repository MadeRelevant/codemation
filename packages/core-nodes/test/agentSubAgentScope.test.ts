import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import type {
  ConnectionInvocationId,
  NodeBackedToolConfig,
  NodeExecutionContext,
  NodeResolver,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TelemetryChildSpanStart,
  TelemetrySpanScope,
  ToolConfig,
  ToolExecuteArgs,
} from "@codemation/core";
import {
  ChildExecutionScopeFactory,
  ConnectionNodeIdFactory,
  ItemExprResolver,
  NoOpTelemetrySpanScope,
  NodeOutputNormalizer,
  RunnableOutputBehaviorResolver,
} from "@codemation/core";
import { DefaultExecutionBinaryService, InMemoryBinaryStorage } from "@codemation/core/bootstrap";

import { NodeBackedToolRuntime } from "../src/nodes/NodeBackedToolRuntime";

class StaticNodeResolver implements NodeResolver {
  constructor(private readonly node: unknown) {}

  resolve<T>(): T {
    return this.node as T;
  }
}

class StaticActivationIdFactory {
  constructor(private readonly id: string) {}

  makeActivationId(): string {
    return this.id;
  }
}

class CapturingChildSpan implements TelemetrySpanScope {
  readonly traceId = "trace_capture";
  readonly spanId: string;
  readonly parentSpanId: string;
  readonly startedChildren: TelemetryChildSpanStart[] = [];

  constructor(spanId: string, parentSpanId: string) {
    this.spanId = spanId;
    this.parentSpanId = parentSpanId;
  }

  async addSpanEvent(): Promise<void> {}
  async recordMetric(): Promise<void> {}
  async attachArtifact() {
    return { artifactId: "noop" };
  }
  async end(): Promise<void> {}
  asNodeTelemetry() {
    return NoOpTelemetrySpanScope.value as unknown as never;
  }
}

class CapturingParentSpan implements TelemetrySpanScope {
  readonly traceId = "trace_parent";
  readonly spanId = "span_tool_call";
  readonly asNodeTelemetryCalls: Array<{ nodeId: string; activationId: string }> = [];

  async addSpanEvent(): Promise<void> {}
  async recordMetric(): Promise<void> {}
  async attachArtifact() {
    return { artifactId: "noop" };
  }
  async end(): Promise<void> {}

  asNodeTelemetry(args: { nodeId: string; activationId: string }) {
    this.asNodeTelemetryCalls.push({ nodeId: args.nodeId, activationId: args.activationId });
    const parentSpanId = this.spanId;
    const traceId = this.traceId;
    const view = {
      traceId,
      spanId: parentSpanId,
      addSpanEvent: () => undefined,
      recordMetric: () => undefined,
      attachArtifact: async () => ({ artifactId: "noop" }),
      end: async () => undefined,
      asNodeTelemetry: () => view,
      forNode: () => view,
      startChildSpan: (childArgs: TelemetryChildSpanStart) =>
        new CapturingChildSpan(`span_child_${childArgs.name}`, parentSpanId),
    };
    return view as unknown as ReturnType<TelemetrySpanScope["asNodeTelemetry"]>;
  }
}

class CtxCapturingRunnableNode implements RunnableNode<RunnableNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;
  readonly inputSchema = z.any();
  capturedCtx: NodeExecutionContext<RunnableNodeConfig> | undefined;

  async execute(args: RunnableNodeExecuteArgs<RunnableNodeConfig>): Promise<unknown> {
    this.capturedCtx = args.ctx;
    return { ok: true };
  }
}

class FakeNodeBackedSubAgentToolConfig implements NodeBackedToolConfig<RunnableNodeConfig, z.ZodAny, z.ZodAny> {
  readonly type = Symbol.for("codemation.test.fakeSubAgentTool");
  readonly name: string;
  readonly description = "fake sub agent";
  readonly node: RunnableNodeConfig;

  constructor(name: string, node: RunnableNodeConfig) {
    this.name = name;
    this.node = node;
  }

  getInputSchema() {
    return z.any();
  }

  toNodeItem(args: { input: unknown; item: { json: unknown } }) {
    return { json: args.input ?? args.item.json };
  }

  toToolOutput() {
    return { ok: true };
  }
}

class FakeAgentNodeConfig {
  readonly type = Symbol.for("codemation.test.fakeAgent");
  readonly name = "Sub agent";
  readonly chatModel = { name: "stub" };
  readonly messages = [{ role: "system" as const, content: "Stub system message" }];
}

test("NodeBackedToolRuntime re-roots ctx for nested-agent tools using ChildExecutionScopeFactory", async () => {
  const captureNode = new CtxCapturingRunnableNode();
  const childScopeFactory = new ChildExecutionScopeFactory(
    new StaticActivationIdFactory("act_child_1") as unknown as Parameters<
      typeof ChildExecutionScopeFactory.prototype.constructor
    >[0],
  );
  const runtime = new NodeBackedToolRuntime(
    new StaticNodeResolver(captureNode),
    new ItemExprResolver(),
    new NodeOutputNormalizer(),
    new RunnableOutputBehaviorResolver(),
    childScopeFactory,
  );

  const subAgentConfig = new FakeAgentNodeConfig() as unknown as RunnableNodeConfig;
  const toolConfig = new FakeNodeBackedSubAgentToolConfig("searchInMail", subAgentConfig);

  const parentSpan = new CapturingParentSpan();
  const parentInvocationId = "inv_tool_call_xyz" as ConnectionInvocationId;
  const orchestratorBinary = new DefaultExecutionBinaryService(
    new InMemoryBinaryStorage(),
    "wf_test",
    "run_test",
    () => new Date(),
  );
  // In the real call path, AIAgentNode.createItemScopedTools wraps the orchestrator's ctx with
  // ConnectionCredentialExecutionContextFactory.forConnectionNode BEFORE calling the runtime, so
  // ctx.nodeId is already the tool connection node id when the runtime sees it.
  const expectedToolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_orchestrator", "searchInMail");
  const parentCtx = {
    runId: "run_test",
    workflowId: "wf_test",
    parent: undefined,
    subworkflowDepth: 0,
    engineMaxNodeActivations: 100,
    engineMaxSubworkflowDepth: 10,
    now: () => new Date(),
    data: {} as never,
    nodeId: expectedToolNodeId,
    activationId: "act_orchestrator",
    iterationId: "iter_orch_0",
    itemIndex: 0,
    config: subAgentConfig,
    binary: orchestratorBinary.forNode({ nodeId: expectedToolNodeId, activationId: "act_orchestrator" }),
    telemetry: NoOpTelemetrySpanScope.value as unknown as never,
    getCredential: async () => "",
  } as unknown as NodeExecutionContext<RunnableNodeConfig>;

  const args: ToolExecuteArgs<ToolConfig, unknown> = {
    config: toolConfig as unknown as ToolConfig,
    input: { query: "find rfqs" },
    ctx: parentCtx,
    item: { json: { query: "find rfqs" } },
    itemIndex: 0,
    items: [{ json: { query: "find rfqs" } }],
    hooks: {
      parentSpan,
      parentInvocationId,
    },
  };

  await runtime.execute(toolConfig as unknown as NodeBackedToolConfig<RunnableNodeConfig, z.ZodAny, z.ZodAny>, args);

  const ctx = captureNode.capturedCtx;
  assert.ok(ctx, "captured ctx");
  assert.equal(ctx!.nodeId, expectedToolNodeId, "child ctx nodeId is the tool connection node id (not doubly nested)");
  assert.equal(
    ctx!.activationId,
    "act_child_1",
    "child ctx gets a fresh activation id from ChildExecutionScopeFactory",
  );
  assert.equal(ctx!.parentInvocationId, parentInvocationId, "child ctx carries parentInvocationId for lineage");
  assert.equal(ctx!.iterationId, undefined, "child ctx must reset iterationId — sub-agent re-iterates");
  assert.equal(parentSpan.asNodeTelemetryCalls.length, 1, "asNodeTelemetry was called once on parent span");
  assert.deepEqual(parentSpan.asNodeTelemetryCalls[0], {
    nodeId: expectedToolNodeId,
    activationId: "act_child_1",
  });
});

test("NodeBackedToolRuntime keeps the orchestrator ctx when the tool is NOT a nested agent", async () => {
  const captureNode = new CtxCapturingRunnableNode();
  const childScopeFactory = new ChildExecutionScopeFactory(
    new StaticActivationIdFactory("act_unused") as unknown as Parameters<
      typeof ChildExecutionScopeFactory.prototype.constructor
    >[0],
  );
  const runtime = new NodeBackedToolRuntime(
    new StaticNodeResolver(captureNode),
    new ItemExprResolver(),
    new NodeOutputNormalizer(),
    new RunnableOutputBehaviorResolver(),
    childScopeFactory,
  );

  const plainConfig = { type: Symbol.for("codemation.test.plain"), name: "plain" } as unknown as RunnableNodeConfig;
  const toolConfig = new FakeNodeBackedSubAgentToolConfig("plain", plainConfig);

  const orchestratorBinary = new DefaultExecutionBinaryService(
    new InMemoryBinaryStorage(),
    "wf_test",
    "run_test",
    () => new Date(),
  );
  const parentCtx = {
    runId: "run_test",
    workflowId: "wf_test",
    parent: undefined,
    subworkflowDepth: 0,
    engineMaxNodeActivations: 100,
    engineMaxSubworkflowDepth: 10,
    now: () => new Date(),
    data: {} as never,
    nodeId: "agent_orchestrator",
    activationId: "act_orchestrator",
    iterationId: "iter_orch_0",
    itemIndex: 0,
    config: plainConfig,
    binary: orchestratorBinary.forNode({ nodeId: "agent_orchestrator", activationId: "act_orchestrator" }),
    telemetry: NoOpTelemetrySpanScope.value as unknown as never,
    getCredential: async () => "",
  } as unknown as NodeExecutionContext<RunnableNodeConfig>;

  await runtime.execute(toolConfig as unknown as NodeBackedToolConfig<RunnableNodeConfig, z.ZodAny, z.ZodAny>, {
    config: toolConfig as unknown as ToolConfig,
    input: {},
    ctx: parentCtx,
    item: { json: {} },
    itemIndex: 0,
    items: [{ json: {} }],
    hooks: undefined,
  });

  const ctx = captureNode.capturedCtx;
  assert.ok(ctx);
  assert.equal(ctx!.nodeId, "agent_orchestrator", "non-agent tool keeps the orchestrator nodeId");
  assert.equal(ctx!.activationId, "act_orchestrator", "non-agent tool keeps the orchestrator activationId");
  assert.equal(ctx!.iterationId, "iter_orch_0", "non-agent tool keeps the orchestrator iterationId");
  assert.equal(ctx!.parentInvocationId, undefined, "non-agent tool does not introduce parentInvocationId");
});

/**
 * Regression: previously the runtime computed `toolConnectionNodeId(args.ctx.nodeId, config.name)`
 * for the child nodeId. Because `args.ctx` is already the tool credential context (its `nodeId`
 * is the tool connection node id), this prepended a SECOND `__conn__tool__<name>` segment on each
 * sub-agent invocation and broke credential resolution (the user-bound credential lives on the
 * single-level connection node id, not the doubled one).
 */
test("NodeBackedToolRuntime does not double-nest the connection node id when invoked with a tool credential context", async () => {
  const captureNode = new CtxCapturingRunnableNode();
  const childScopeFactory = new ChildExecutionScopeFactory(
    new StaticActivationIdFactory("act_child_1") as unknown as Parameters<
      typeof ChildExecutionScopeFactory.prototype.constructor
    >[0],
  );
  const runtime = new NodeBackedToolRuntime(
    new StaticNodeResolver(captureNode),
    new ItemExprResolver(),
    new NodeOutputNormalizer(),
    new RunnableOutputBehaviorResolver(),
    childScopeFactory,
  );

  const subAgentConfig = new FakeAgentNodeConfig() as unknown as RunnableNodeConfig;
  const toolConfig = new FakeNodeBackedSubAgentToolConfig("searchInMail", subAgentConfig);

  const orchestratorBinary = new DefaultExecutionBinaryService(
    new InMemoryBinaryStorage(),
    "wf_test",
    "run_test",
    () => new Date(),
  );
  const toolConnectionNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_orchestrator", "searchInMail");
  const toolCredentialContext = {
    runId: "run_test",
    workflowId: "wf_test",
    parent: undefined,
    subworkflowDepth: 0,
    engineMaxNodeActivations: 100,
    engineMaxSubworkflowDepth: 10,
    now: () => new Date(),
    data: {} as never,
    nodeId: toolConnectionNodeId,
    activationId: "act_orchestrator",
    iterationId: "iter_orch_0",
    itemIndex: 0,
    config: subAgentConfig,
    binary: orchestratorBinary.forNode({ nodeId: toolConnectionNodeId, activationId: "act_orchestrator" }),
    telemetry: NoOpTelemetrySpanScope.value as unknown as never,
    getCredential: async () => "",
  } as unknown as NodeExecutionContext<RunnableNodeConfig>;

  await runtime.execute(toolConfig as unknown as NodeBackedToolConfig<RunnableNodeConfig, z.ZodAny, z.ZodAny>, {
    config: toolConfig as unknown as ToolConfig,
    input: { query: "find rfqs" },
    ctx: toolCredentialContext,
    item: { json: { query: "find rfqs" } },
    itemIndex: 0,
    items: [{ json: { query: "find rfqs" } }],
    hooks: {
      parentSpan: new CapturingParentSpan(),
      parentInvocationId: "inv_tool_call_xyz" as ConnectionInvocationId,
    },
  });

  const ctx = captureNode.capturedCtx;
  assert.ok(ctx, "captured ctx");
  assert.equal(
    ctx!.nodeId,
    toolConnectionNodeId,
    "sub-agent ctx nodeId equals the tool connection node id (single, not doubled)",
  );
  assert.equal(ctx!.nodeId.split("__conn__tool__").length - 1, 1, "exactly one '__conn__tool__' segment");
});
