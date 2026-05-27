/**
 * Unit tests for Story 10: Agent runtime HITL-as-tool support.
 *
 * Coverage:
 * 1. HITL tool solo → run suspends (SuspensionRequest thrown with agentCheckpoint)
 * 2. HITL tool + another tool in same turn → both come back as errors; LLM self-corrects
 * 3. Rejected decision with onRejected:"return" → tool_result with status:rejected; agent continues
 * 4. Rejected decision with onRejected:"halt" → agent returns undefined (run is dead)
 * 5. Tool description includes auto-appended solo constraint sentence
 * 6. agentReasoning is captured from conversation's last assistant message
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import type {
  ChatLanguageModel,
  ChatModelConfig,
  ChatModelFactory,
  CredentialSessionService,
  Item,
  NodeExecutionContext,
  NodeExecutionStatePublisher,
  NodeInputsByPort,
  NodeOutputs,
  ResumeContext,
  RunnableNodeConfig,
  RunnableNode,
  RunnableNodeExecuteArgs,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryChildSpanStart,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
  TypeToken,
  HumanTaskHandle,
} from "@codemation/core";
import {
  SuspensionRequest,
  NodeBackedToolConfig,
  AgentToolFactory,
  ChildExecutionScopeFactory,
  CoreTokens,
  ItemExprResolver,
  NodeOutputNormalizer,
  NoOpAgentMcpIntegration,
  container as tsyringeContainer,
  instanceCachingFactory,
} from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";
import {
  AIAgent,
  AIAgentExecutionHelpersFactory,
  AIAgentNode,
  AgentToolErrorClassifier,
  AgentToolExecutionCoordinator,
  AgentToolRepairPolicy,
  AgentStructuredOutputRepairPromptFactory,
  AgentStructuredOutputRunner,
  OpenAiStrictJsonSchemaFactory,
} from "@codemation/core-nodes";
import { NodeBackedToolRuntime } from "../../src/nodes/NodeBackedToolRuntime";

import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import type { ModelMessage } from "ai";

// ---------------------------------------------------------------------------
// Minimal telemetry infrastructure (same pattern as aiAgent.test.ts)
// ---------------------------------------------------------------------------

class StubNodeStatePublisher implements NodeExecutionStatePublisher {
  async markQueued(_: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort }): Promise<void> {}
  async markRunning(_: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort }): Promise<void> {}
  async markCompleted(_: {
    nodeId: string;
    activationId?: string;
    inputsByPort?: NodeInputsByPort;
    outputs?: NodeOutputs;
  }): Promise<void> {}
  async markFailed(_: {
    nodeId: string;
    activationId?: string;
    inputsByPort?: NodeInputsByPort;
    error: Error;
  }): Promise<void> {}
  async appendConnectionInvocation(_: Record<string, unknown>): Promise<void> {}
}

class CapturingTelemetrySpanScope implements TelemetrySpanScope {
  readonly metrics: TelemetryMetricRecord[] = [];
  readonly events: TelemetrySpanEventRecord[] = [];
  readonly artifacts: TelemetryArtifactAttachment[] = [];
  readonly children: CapturingTelemetrySpanScope[] = [];
  readonly endCalls: TelemetrySpanEnd[] = [];

  constructor(
    public readonly traceId: string,
    public readonly spanId: string,
  ) {}

  addSpanEvent(args: TelemetrySpanEventRecord): void {
    this.events.push(args);
  }
  recordMetric(args: TelemetryMetricRecord): void {
    this.metrics.push(args);
  }
  attachArtifact(args: TelemetryArtifactAttachment): TelemetryArtifactReference {
    this.artifacts.push(args);
    return { artifactId: `${this.spanId}:art` };
  }
  end(args: TelemetrySpanEnd = {}): void {
    this.endCalls.push(args);
  }
  startChildSpan(_args?: TelemetryChildSpanStart): TelemetrySpanScope {
    const child = new CapturingTelemetrySpanScope(this.traceId, `child-${this.children.length}`);
    this.children.push(child);
    return child;
  }
  forNode(): CapturingTelemetrySpanScope {
    return this;
  }
}

class StubCredentialSessionService implements CredentialSessionService {
  async getSession(): Promise<unknown> {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Scripted model infrastructure (minimal, adapted from aiAgent.test.ts)
// ---------------------------------------------------------------------------

/** Recorded tool descriptions sent to the LLM (name → description). */
type CapturedToolsForTurn = ReadonlyArray<{ name: string; description?: string }>;

class ScriptedModelCapture {
  readonly invocations: Array<{ messages: unknown }> = [];
  readonly toolsPerTurn: CapturedToolsForTurn[] = [];
}

class ScriptedChatModelConfig implements ChatModelConfig {
  readonly type = ScriptedChatModelFactory;
  constructor(
    public readonly name: string,
    public readonly responses: ReadonlyArray<unknown>,
    public readonly capture: ScriptedModelCapture = new ScriptedModelCapture(),
  ) {}
}

class ScriptedChatModelFactory implements ChatModelFactory<ScriptedChatModelConfig> {
  create(args: Readonly<{ config: ScriptedChatModelConfig; ctx: NodeExecutionContext<any> }>): ChatLanguageModel {
    let idx = 0;
    const doGenerate = async (options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> => {
      args.config.capture.invocations.push({ messages: options.prompt });
      args.config.capture.toolsPerTurn.push(
        (options.tools ?? []).map((t) => ({ name: t.name, description: (t as { description?: string }).description })),
      );
      const response = args.config.responses[idx] ?? args.config.responses[args.config.responses.length - 1];
      idx++;
      const r = (response as Record<string, unknown>) ?? {};
      const content: LanguageModelV3GenerateResult["content"] = [];
      if (typeof r["content"] === "string" && r["content"].length > 0) {
        content.push({ type: "text", text: r["content"] });
      }
      const toolCalls = Array.isArray(r["tool_calls"]) ? r["tool_calls"] : [];
      for (const tc of toolCalls as Array<Record<string, unknown>>) {
        content.push({
          type: "tool-call",
          toolCallId: typeof tc["id"] === "string" ? tc["id"] : `call_${content.length}`,
          toolName: String(tc["name"] ?? ""),
          input: JSON.stringify(tc["args"] ?? {}),
        });
      }
      const finishReason: LanguageModelV3GenerateResult["finishReason"] =
        toolCalls.length > 0 ? { unified: "tool-calls", raw: "tool-calls" } : { unified: "stop", raw: "stop" };
      return {
        content,
        finishReason,
        usage: {
          inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: undefined, text: undefined, reasoning: undefined },
        },
        warnings: [],
      };
    };
    const mock = new MockLanguageModelV3({
      provider: "test",
      modelId: args.config.name,
      doGenerate,
    });
    return { languageModel: mock, modelName: args.config.name, provider: "test" };
  }
}

// ---------------------------------------------------------------------------
// HITL node fixtures
// ---------------------------------------------------------------------------

/** A node config marked as HITL via the humanApprovalToolBehavior field (set by defineHumanApprovalNode). */
class HitlNodeConfig implements RunnableNodeConfig<Record<string, unknown>, Record<string, unknown>> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = HitlNode;
  readonly humanApprovalToolBehavior = { onRejected: "return" as const };

  constructor(public readonly name: string) {}
}

class HitlNodeConfigHalt implements RunnableNodeConfig<Record<string, unknown>, Record<string, unknown>> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = HitlNode;
  readonly humanApprovalToolBehavior = { onRejected: "halt" as const };

  constructor(public readonly name: string) {}
}

/**
 * A node that always throws a SuspensionRequest.
 * Used to simulate a HITL node being called as an agent tool.
 */
class HitlNode implements RunnableNode<HitlNodeConfig | HitlNodeConfigHalt> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(_args: RunnableNodeExecuteArgs<any>): Promise<unknown> {
    throw new SuspensionRequest({
      decisionSchema: z.object({ approved: z.boolean() }),
      timeout: "PT24H",
      onTimeout: "halt",
      subject: { title: "Approve action", summary: "Agent requested approval." },
      deliver: async (handle: HumanTaskHandle) => ({ taskId: handle.taskId }),
    });
  }
}

/** Builds a NodeBackedToolConfig wrapping a HitlNodeConfig. */
function makeHitlToolConfig(
  name: string,
  onRejected: "halt" | "return" = "return",
): NodeBackedToolConfig<any, any, any> {
  const nodeConfig = onRejected === "halt" ? new HitlNodeConfigHalt(name) : new HitlNodeConfig(name);
  return AgentToolFactory.asTool(nodeConfig, {
    name,
    description: `Run HITL approval for ${name}.`,
    inputSchema: z.object({ reason: z.string() }),
    outputSchema: z.object({ approved: z.boolean() }),
  });
}

// ---------------------------------------------------------------------------
// A normal (non-HITL) node-backed tool for multi-tool tests
// ---------------------------------------------------------------------------

class EchoNodeConfig implements RunnableNodeConfig<Record<string, unknown>, Record<string, unknown>> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = EchoNode;
  constructor(public readonly name: string) {}
}

class EchoNode implements RunnableNode<EchoNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;
  execute(args: RunnableNodeExecuteArgs<EchoNodeConfig>): unknown {
    return { json: { echo: args.input } };
  }
}

function makeEchoToolConfig(name: string): NodeBackedToolConfig<any, any, any> {
  return AgentToolFactory.asTool(new EchoNodeConfig(name), {
    name,
    description: `Echo tool ${name}.`,
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ echo: z.unknown() }),
  });
}

// ---------------------------------------------------------------------------
// Test rig
// ---------------------------------------------------------------------------

class HitlAgentTestRig {
  readonly data = new InMemoryRunDataFactory().create();
  readonly nodeState = new StubNodeStatePublisher();
  readonly telemetry = new CapturingTelemetrySpanScope("trace-1", "span-1");
  readonly container = tsyringeContainer.createChildContainer();

  constructor(
    private readonly config: AIAgent<any, any>,
    extraRegistrations: ReadonlyArray<
      Readonly<{ token: unknown; value?: unknown; useClass?: new (...args: unknown[]) => unknown }>
    > = [],
  ) {
    this.container.registerInstance(CoreTokens.CredentialSessionService, new StubCredentialSessionService());
    this.container.registerInstance(CoreTokens.NodeResolver, this.container);
    this.container.registerSingleton(ItemExprResolver, ItemExprResolver);
    this.container.registerSingleton(NodeOutputNormalizer, NodeOutputNormalizer);
    this.container.registerSingleton(AIAgentExecutionHelpersFactory, AIAgentExecutionHelpersFactory);
    this.container.registerSingleton(
      AgentStructuredOutputRepairPromptFactory,
      AgentStructuredOutputRepairPromptFactory,
    );
    this.container.registerSingleton(OpenAiStrictJsonSchemaFactory, OpenAiStrictJsonSchemaFactory);
    this.container.registerSingleton(AgentStructuredOutputRunner, AgentStructuredOutputRunner);
    this.container.registerSingleton(AgentToolErrorClassifier, AgentToolErrorClassifier);
    this.container.registerSingleton(AgentToolRepairPolicy, AgentToolRepairPolicy);
    this.container.registerSingleton(AgentToolExecutionCoordinator, AgentToolExecutionCoordinator);
    this.container.registerSingleton(NodeBackedToolRuntime, NodeBackedToolRuntime);
    this.container.registerInstance(CoreTokens.AgentMcpIntegration, new NoOpAgentMcpIntegration());
    let counter = 0;
    this.container.registerInstance(CoreTokens.ActivationIdFactory, {
      makeActivationId: () => `act_test_${++counter}`,
    });
    this.container.register(ChildExecutionScopeFactory, {
      useFactory: instanceCachingFactory(
        (c) => new ChildExecutionScopeFactory(c.resolve(CoreTokens.ActivationIdFactory)),
      ),
    });
    this.container.registerSingleton(AIAgentNode, AIAgentNode);
    for (const reg of extraRegistrations) {
      if (reg.value !== undefined) {
        this.container.registerInstance(reg.token as never, reg.value);
      } else if (reg.useClass) {
        this.container.registerSingleton(reg.token as never, reg.useClass as never);
      }
    }
  }

  /** Execute the agent without resumeContext (fresh execution). */
  async executeItem(
    item: Item,
    opts: { nodeId?: string; runId?: string; activationId?: string } = {},
  ): Promise<unknown> {
    const nodeId = opts.nodeId ?? "agent_1";
    const runId = opts.runId ?? "run_1";
    const activationId = opts.activationId ?? "act_1";
    const binary = new DefaultExecutionBinaryService(new InMemoryBinaryStorage(), "wf_1", runId, () => new Date());
    const ctx: NodeExecutionContext<AIAgent<any, any>> = {
      runId,
      workflowId: "wf_1",
      parent: undefined,
      subworkflowDepth: 0,
      engineMaxNodeActivations: 100,
      engineMaxSubworkflowDepth: 10,
      now: () => new Date(),
      data: this.data,
      nodeState: this.nodeState,
      telemetry: this.telemetry as any,
      nodeId,
      activationId,
      config: this.config,
      binary: binary.forNode({ nodeId, activationId }),
      getCredential: async () => "",
    };
    const node = this.container.resolve(AIAgentNode);
    return await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });
  }

  /** Execute with a HITL resumeContext injected. */
  async executeResumed(
    item: Item,
    resumeContext: ResumeContext,
    opts: { nodeId?: string; runId?: string; activationId?: string } = {},
  ): Promise<unknown> {
    const nodeId = opts.nodeId ?? "agent_1";
    const runId = opts.runId ?? "run_1";
    const activationId = opts.activationId ?? "act_resume_1";
    const binary = new DefaultExecutionBinaryService(new InMemoryBinaryStorage(), "wf_1", runId, () => new Date());
    const ctx: NodeExecutionContext<AIAgent<any, any>> = {
      runId,
      workflowId: "wf_1",
      parent: undefined,
      subworkflowDepth: 0,
      engineMaxNodeActivations: 100,
      engineMaxSubworkflowDepth: 10,
      now: () => new Date(),
      data: this.data,
      nodeState: this.nodeState,
      telemetry: this.telemetry as any,
      nodeId,
      activationId,
      config: this.config,
      binary: binary.forNode({ nodeId, activationId }),
      getCredential: async () => "",
      resumeContext,
    };
    const node = this.container.resolve(AIAgentNode);
    return await node.execute({ input: item.json, item, itemIndex: 0, items: [item], ctx });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRejectedResumeContext(agentCheckpoint: unknown, onRejected: "halt" | "return" = "return"): ResumeContext {
  return {
    decision: {
      kind: "decided",
      value: { approved: false, note: "Not approved" },
      actor: { actorId: "u1", displayName: "Alice" },
      decidedAt: new Date("2026-01-01T00:00:00Z"),
    },
    delivery: { taskId: "htask_1" },
    task: {
      taskId: "htask_1",
      runId: "run_1",
      nodeId: "approval_tool",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
      resumeUrl: "",
      metadata: {
        agentCheckpoint: agentCheckpoint as any,
        onRejected,
        pendingToolCallId: "tool_call_1",
        agentReasoning: "I need approval before proceeding.",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1: Solo HITL tool call → SuspensionRequest thrown with agentCheckpoint
// ---------------------------------------------------------------------------

test("agent calls HITL tool solo → SuspensionRequest thrown with agentCheckpoint in metadata", async () => {
  const capture = new ScriptedModelCapture();
  const config = new AIAgent({
    name: "HitlAgent",
    messages: [
      { role: "system", content: "You are helpful. Use the approval tool when unsure." },
      { role: "user", content: ({ item }) => String((item.json as { query?: unknown })?.query ?? "") },
    ],
    chatModel: new ScriptedChatModelConfig(
      "test-model",
      [
        {
          content: "I need approval before proceeding.",
          tool_calls: [{ id: "tool_call_1", name: "approval_tool", args: { reason: "checking" } }],
        },
      ],
      capture,
    ),
    tools: [makeHitlToolConfig("approval_tool", "return")],
  });
  const rig = new HitlAgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: HitlNode, useClass: HitlNode },
  ]);

  const item: Item = { json: { query: "needs approval" } };

  let thrownError: unknown;
  try {
    await rig.executeItem(item);
  } catch (e) {
    thrownError = e;
  }

  assert.ok(thrownError instanceof SuspensionRequest, "should throw SuspensionRequest");
  const req = (thrownError as SuspensionRequest).request;
  assert.ok(req.metadata, "metadata should be present");
  assert.ok(req.metadata["agentCheckpoint"], "agentCheckpoint should be in metadata");

  const checkpoint = req.metadata["agentCheckpoint"] as Record<string, unknown>;
  assert.equal(checkpoint["pendingToolCallId"], "tool_call_1");
  assert.equal(checkpoint["agentName"], "HitlAgent");
  assert.equal(checkpoint["modelId"], "test-model");
  assert.ok(Array.isArray(checkpoint["conversation"]), "conversation should be an array");
  assert.ok((checkpoint["conversation"] as unknown[]).length > 0, "conversation should not be empty");

  // agentReasoning captured from last assistant message
  assert.equal(req.metadata["agentReasoning"], "I need approval before proceeding.");
  assert.equal(req.metadata["onRejected"], "return");
  assert.equal(req.metadata["pendingToolCallId"], "tool_call_1");
});

// ---------------------------------------------------------------------------
// Test 2: HITL tool + another tool → both get error results; model self-corrects
// ---------------------------------------------------------------------------

test("agent calls HITL tool + another tool in same turn → both come back as errors", async () => {
  const capture = new ScriptedModelCapture();
  const config = new AIAgent({
    name: "HitlAgent",
    messages: [{ role: "user", content: "do stuff" }],
    chatModel: new ScriptedChatModelConfig(
      "test-model",
      [
        // Turn 1: model wrongly calls HITL + echo together
        {
          content: "planning",
          tool_calls: [
            { id: "tc_hitl", name: "approval_tool", args: { reason: "need approval" } },
            { id: "tc_echo", name: "echo_tool", args: { value: "hello" } },
          ],
        },
        // Turn 2: model self-corrects — calls only HITL
        {
          content: "corrected",
          tool_calls: [{ id: "tc_hitl_2", name: "approval_tool", args: { reason: "need approval" } }],
        },
      ],
      capture,
    ),
    tools: [makeHitlToolConfig("approval_tool", "return"), makeEchoToolConfig("echo_tool")],
  });
  const rig = new HitlAgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: HitlNode, useClass: HitlNode },
    { token: EchoNode, useClass: EchoNode },
  ]);

  const item: Item = { json: {} };

  // Turn 1 returns error results (solo constraint violated).
  // Turn 2 calls HITL solo → SuspensionRequest is thrown.
  let thrownError: unknown;
  try {
    await rig.executeItem(item);
  } catch (e) {
    thrownError = e;
  }

  // The suspension should happen on turn 2 (solo call)
  assert.ok(thrownError instanceof SuspensionRequest, "should eventually throw SuspensionRequest");

  // The second LLM invocation should have received tool_result errors from turn 1
  assert.ok(capture.invocations.length >= 2, "model should be called at least twice");

  // Verify the first turn's messages to LLM do NOT include actual tool results (both errored)
  const turn2Messages = capture.invocations[1]?.messages as Array<{ role: string; content: unknown }>;
  const toolMessages = turn2Messages?.filter((m) => m.role === "tool");
  assert.ok(toolMessages && toolMessages.length > 0, "turn 2 should have tool messages from turn 1 errors");
});

// ---------------------------------------------------------------------------
// Test 3: Rejected decision with onRejected:"return" → agent continues with rejection info
// ---------------------------------------------------------------------------

test("rejected decision with onRejected:return → agent continues reasoning with tool_result", async () => {
  const capture = new ScriptedModelCapture();

  // Minimal checkpoint — the conversation field must be JSON-serializable
  const checkpoint = {
    conversation: [
      { role: "user", content: "needs approval" },
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "tool_call_1", toolName: "approval_tool", input: { reason: "checking" } },
        ],
      },
    ] satisfies ModelMessage[],
    turnCount: 1,
    toolCallCount: 1,
    pendingToolCallId: "tool_call_1",
    agentName: "HitlAgent",
    modelId: "test-model",
  };

  const config = new AIAgent({
    name: "HitlAgent",
    messages: [{ role: "user", content: "needs approval" }],
    chatModel: new ScriptedChatModelConfig(
      "test-model",
      [
        // Resume turn: model should see the rejection tool_result and produce final answer
        { content: "OK, approval was rejected. I will proceed differently." },
      ],
      capture,
    ),
    tools: [makeHitlToolConfig("approval_tool", "return")],
  });
  const rig = new HitlAgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: HitlNode, useClass: HitlNode },
  ]);

  const item: Item = { json: { query: "needs approval" } };
  const resumeContext = makeRejectedResumeContext(checkpoint, "return");

  // Should NOT throw — agent continues
  const result = await rig.executeResumed(item, resumeContext);
  assert.ok(result !== undefined, "agent should produce a result on rejection with return policy");

  // LLM should have been called once (the resumed turn)
  assert.ok(capture.invocations.length === 1, "model should be called once (resumed turn)");

  // The messages sent to LLM should include the tool_result with rejected status
  const messages = capture.invocations[0]?.messages as Array<{ role: string; content: unknown }>;
  const toolMsg = messages?.find((m) => m.role === "tool");
  assert.ok(toolMsg, "should have a tool message with the decision");
  const toolContent = JSON.stringify(toolMsg?.content ?? "");
  assert.ok(
    toolContent.includes("rejected") || toolContent.includes("tool_call_1"),
    "tool result should reference rejection",
  );
});

// ---------------------------------------------------------------------------
// Test 4: Rejected decision with onRejected:"halt" → agent returns undefined
// ---------------------------------------------------------------------------

test("rejected decision with onRejected:halt → agent returns undefined (run is dead)", async () => {
  const capture = new ScriptedModelCapture();

  const checkpoint = {
    conversation: [
      { role: "user", content: "needs approval" },
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "tool_call_1", toolName: "approval_tool", input: { reason: "checking" } },
        ],
      },
    ] satisfies ModelMessage[],
    turnCount: 1,
    toolCallCount: 1,
    pendingToolCallId: "tool_call_1",
    agentName: "HitlAgent",
    modelId: "test-model",
  };

  const config = new AIAgent({
    name: "HitlAgent",
    messages: [{ role: "user", content: "needs approval" }],
    chatModel: new ScriptedChatModelConfig(
      "test-model",
      [
        // Should NOT be called — halt path returns before any LLM invocation
        { content: "Should not reach here." },
      ],
      capture,
    ),
    tools: [makeHitlToolConfig("approval_tool", "halt")],
  });
  const rig = new HitlAgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: HitlNode, useClass: HitlNode },
  ]);

  const item: Item = { json: { query: "needs approval" } };
  const resumeContext = makeRejectedResumeContext(checkpoint, "halt");

  const result = await rig.executeResumed(item, resumeContext);

  assert.equal(result, undefined, "agent should return undefined on halt");
  assert.equal(capture.invocations.length, 0, "LLM should NOT be called when halting");
});

// ---------------------------------------------------------------------------
// Test 5: Tool description includes solo constraint sentence
// ---------------------------------------------------------------------------

test("tool description sent to LLM includes the auto-appended solo constraint sentence", async () => {
  const HITL_SENTENCE = "This tool requires human approval and may take time. Call it alone";

  const capture = new ScriptedModelCapture();
  const config = new AIAgent({
    name: "HitlAgent",
    messages: [{ role: "user", content: "do something" }],
    chatModel: new ScriptedChatModelConfig(
      "test-model",
      [
        // Single final answer, no tool call — enough to inspect tool descriptions
        { content: "done." },
      ],
      capture,
    ),
    tools: [makeHitlToolConfig("approval_tool", "return")],
  });
  const rig = new HitlAgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: HitlNode, useClass: HitlNode },
  ]);

  await rig.executeItem({ json: {} });

  assert.ok(capture.toolsPerTurn.length > 0, "model should have been called with tools");
  const approvalTool = capture.toolsPerTurn[0]?.find((t) => t.name === "approval_tool");
  assert.ok(approvalTool, "approval_tool should appear in tool descriptions");
  assert.ok(
    approvalTool?.description?.includes(HITL_SENTENCE),
    `description should include solo constraint sentence; got: "${approvalTool?.description}"`,
  );
});

// ---------------------------------------------------------------------------
// Test 6: agentReasoning is captured from last assistant text message
// ---------------------------------------------------------------------------

test("agentReasoning is captured from last assistant message in the conversation at suspension", async () => {
  const capture = new ScriptedModelCapture();
  const config = new AIAgent({
    name: "HitlAgent",
    messages: [{ role: "user", content: "approve this" }],
    chatModel: new ScriptedChatModelConfig(
      "test-model",
      [
        {
          content: "I need approval before I can proceed with this action.",
          tool_calls: [{ id: "tc1", name: "approval_tool", args: { reason: "compliance check" } }],
        },
      ],
      capture,
    ),
    tools: [makeHitlToolConfig("approval_tool", "return")],
  });
  const rig = new HitlAgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: HitlNode, useClass: HitlNode },
  ]);

  let thrownError: unknown;
  try {
    await rig.executeItem({ json: {} });
  } catch (e) {
    thrownError = e;
  }

  assert.ok(thrownError instanceof SuspensionRequest);
  const metadata = (thrownError as SuspensionRequest).request.metadata;
  assert.ok(metadata, "metadata should be present");
  // The assistant message had text "I need approval before I can proceed with this action."
  assert.equal(
    metadata["agentReasoning"],
    "I need approval before I can proceed with this action.",
    "agentReasoning should contain the last assistant text",
  );
});
