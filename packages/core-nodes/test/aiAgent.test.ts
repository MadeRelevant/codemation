import type {
  AgentMessageDto,
  ChatLanguageModel,
  ChatModelConfig,
  ChatModelFactory,
  CostTrackingPriceQuote,
  CostTrackingTelemetry,
  CostTrackingUsageRecord,
  CredentialSessionService,
  Item,
  Items,
  NodeExecutionTelemetry,
  NodeExecutionContext,
  NodeExecutionStatePublisher,
  NodeInputsByPort,
  NodeOutputs,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  Tool,
  ToolConfig,
  ToolExecuteArgs,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryChildSpanStart,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
  TypeToken,
} from "@codemation/core";
import {
  AgentToolFactory,
  ConnectionNodeIdFactory,
  CoreTokens,
  ItemExprResolver,
  NodeOutputNormalizer,
  callableTool,
  container as tsyringeContainer,
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
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "vitest";
import { z } from "zod";
import { MockLanguageModelV3 } from "ai/test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
  LanguageModelV3Prompt,
} from "@ai-sdk/provider";
import { NodeBackedToolRuntime } from "../src/nodes/NodeBackedToolRuntime";

class CapturingNodeStatePublisher implements NodeExecutionStatePublisher {
  readonly events: string[] = [];
  readonly queuedInputsByNodeId = new Map<string, NodeInputsByPort | undefined>();
  readonly runningInputsByNodeId = new Map<string, NodeInputsByPort | undefined>();
  readonly completedInputsByNodeId = new Map<string, NodeInputsByPort | undefined>();
  readonly completedOutputsByNodeId = new Map<string, NodeOutputs | undefined>();

  async markQueued(args: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort }): Promise<void> {
    this.events.push(`queued:${args.nodeId}`);
    this.queuedInputsByNodeId.set(args.nodeId, args.inputsByPort);
  }

  async markRunning(args: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort }): Promise<void> {
    this.events.push(`running:${args.nodeId}`);
    this.runningInputsByNodeId.set(args.nodeId, args.inputsByPort);
  }

  async markCompleted(args: {
    nodeId: string;
    activationId?: string;
    inputsByPort?: NodeInputsByPort;
    outputs?: NodeOutputs;
  }): Promise<void> {
    this.events.push(`completed:${args.nodeId}`);
    this.completedInputsByNodeId.set(args.nodeId, args.inputsByPort);
    this.completedOutputsByNodeId.set(args.nodeId, args.outputs);
  }

  async markFailed(args: {
    nodeId: string;
    activationId?: string;
    inputsByPort?: NodeInputsByPort;
    error: Error;
  }): Promise<void> {
    this.events.push(`failed:${args.nodeId}`);
  }

  readonly connectionInvocations: Array<Record<string, unknown>> = [];

  async appendConnectionInvocation(args: Record<string, unknown>): Promise<void> {
    this.connectionInvocations.push(args);
  }
}

class CapturingTelemetrySpanScope implements TelemetrySpanScope {
  readonly metrics: TelemetryMetricRecord[] = [];
  readonly events: TelemetrySpanEventRecord[] = [];
  readonly artifacts: TelemetryArtifactAttachment[] = [];
  readonly ended: TelemetrySpanEnd[] = [];
  costTracking?: CostTrackingTelemetry;
  protected readonly children: CapturingTelemetrySpanScope[];

  constructor(
    public readonly traceId: string,
    public readonly spanId: string,
    childSpans: CapturingTelemetrySpanScope[],
    public readonly initialAttributes?: Record<string, unknown>,
  ) {
    this.children = childSpans;
  }

  addSpanEvent(args: TelemetrySpanEventRecord): void {
    this.events.push(args);
  }

  recordMetric(args: TelemetryMetricRecord): void {
    this.metrics.push(args);
  }

  attachArtifact(args: TelemetryArtifactAttachment): TelemetryArtifactReference {
    this.artifacts.push(args);
    return { artifactId: `${this.spanId}:artifact` };
  }

  end(args: TelemetrySpanEnd = {}): void {
    this.ended.push(args);
  }

  createChild(spanId: string, initialAttributes?: Record<string, unknown>): CapturingTelemetrySpanScope {
    const child = new CapturingTelemetrySpanScope(this.traceId, spanId, this.children, initialAttributes);
    this.children.push(child);
    return child;
  }
}

class CapturingNodeTelemetry extends CapturingTelemetrySpanScope implements NodeExecutionTelemetry {
  constructor(traceId = "trace-1", spanId = "node-span-1") {
    super(traceId, spanId, []);
  }

  forNode(): NodeExecutionTelemetry {
    return this;
  }

  startChildSpan(args?: TelemetryChildSpanStart): TelemetrySpanScope {
    const child = this.createChild(
      `child-${this.metrics.length}-${this.events.length}-${this.artifacts.length}`,
      (args?.attributes as Record<string, unknown> | undefined) ?? undefined,
    );
    child.costTracking = this.costTracking?.forScope(child);
    return child;
  }

  childSpans(): ReadonlyArray<CapturingTelemetrySpanScope> {
    return [...this.children];
  }
}

class CapturingCostTrackingTelemetry implements CostTrackingTelemetry {
  constructor(
    private readonly scope: TelemetrySpanScope,
    private readonly capturedUsages: CostTrackingUsageRecord[],
  ) {}

  async captureUsage(args: CostTrackingUsageRecord): Promise<CostTrackingPriceQuote | undefined> {
    this.capturedUsages.push(args);
    const estimatedAmountMinor = args.operation === "completion.output" ? args.quantity * 2_000 : args.quantity * 1_000;
    await this.scope.recordMetric({
      name: "codemation.cost.estimated",
      value: estimatedAmountMinor,
      unit: "USD",
      attributes: {
        "cost.component": args.component,
        "cost.currency": "USD",
        "cost.currency_scale": 1_000_000_000,
      },
    });
    return {
      currency: "USD",
      currencyScale: 1_000_000_000,
      estimatedAmountMinor,
      estimateKind: "catalog",
    };
  }

  forScope(scope: TelemetrySpanScope): CostTrackingTelemetry {
    return new CapturingCostTrackingTelemetry(scope, this.capturedUsages);
  }
}

class ScriptedChatModelCapture {
  readonly invocations: Array<Readonly<{ messages: unknown; options: unknown }>> = [];
  readonly boundToolNames: ReadonlyArray<ReadonlyArray<string>> = [];
  readonly structuredInvocations: Array<Readonly<{ messages: unknown; options: unknown }>> = [];
  readonly structuredBindings: Array<Readonly<{ outputSchema: unknown; config: unknown }>> = [];

  constructor(private readonly mutableBoundToolNames: string[][] = []) {}

  recordInvocation(messages: unknown, options: unknown): void {
    this.invocations.push({ messages, options });
  }

  recordBoundTools(tools: ReadonlyArray<unknown>): void {
    this.mutableBoundToolNames.push(
      tools
        .map((tool) => {
          const candidate = tool as Readonly<{ name?: unknown }>;
          return typeof candidate.name === "string" ? candidate.name : "unknown";
        })
        .filter((name) => name !== "unknown"),
    );
  }

  recordStructuredInvocation(messages: unknown, options: unknown): void {
    this.structuredInvocations.push({ messages, options });
  }

  recordStructuredBinding(outputSchema: unknown, config: unknown): void {
    this.structuredBindings.push({ outputSchema, config });
  }

  snapshotBoundToolNames(): ReadonlyArray<ReadonlyArray<string>> {
    return this.mutableBoundToolNames.map((entry) => [...entry]);
  }
}

class ScriptedChatModelConfig implements ChatModelConfig {
  readonly type = ScriptedChatModelFactory;

  constructor(
    public readonly name: string,
    public readonly responses: ReadonlyArray<unknown>,
    public readonly capture: ScriptedChatModelCapture = new ScriptedChatModelCapture(),
    public readonly structuredResponses?: ReadonlyArray<unknown>,
  ) {}
}

/**
 * Normalizes the AI SDK V3 prompt (`Array<LanguageModelV3Message>`) to a flat
 * `{ role, content: string }[]` shape used by the scripted-model test assertions below. Text parts
 * are concatenated; non-text content is kept as-is.
 */
class ScriptedPromptNormalizer {
  static normalize(prompt: LanguageModelV3Prompt): ReadonlyArray<{ role: string; content: unknown }> {
    return prompt.map((message) => this.normalizeMessage(message));
  }

  private static normalizeMessage(message: LanguageModelV3Message): { role: string; content: unknown } {
    if (message.role === "system") {
      return { role: "system", content: message.content };
    }
    if (message.role === "user" || message.role === "assistant") {
      const textParts = message.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text);
      const hasNonText = message.content.some((part) => part.type !== "text");
      if (!hasNonText && textParts.length > 0) {
        return { role: message.role, content: textParts.join("") };
      }
      return { role: message.role, content: message.content };
    }
    return { role: message.role, content: message.content };
  }
}

/**
 * Builds an AI-SDK-V3 `LanguageModelV3GenerateResult` from the scripted-model test DSL
 * `{ content, tool_calls?, usage_metadata? }`. This concise shape keeps test fixtures readable; the
 * converter adapts it to the AI SDK's provider result so the real agent runtime runs end-to-end.
 */
class ScriptedResponseConverter {
  static toGenerateResult(response: unknown): LanguageModelV3GenerateResult {
    const r = (response as Record<string, unknown>) ?? {};
    const content: LanguageModelV3GenerateResult["content"] = [];
    if (typeof r["content"] === "string" && r["content"].length > 0) {
      content.push({ type: "text", text: r["content"] });
    }
    const toolCalls = Array.isArray(r["tool_calls"]) ? r["tool_calls"] : [];
    for (const toolCall of toolCalls) {
      const tc = toolCall as Record<string, unknown>;
      content.push({
        type: "tool-call",
        toolCallId: typeof tc["id"] === "string" ? tc["id"] : `call_${content.length}`,
        toolName: String(tc["name"] ?? ""),
        input: JSON.stringify(tc["args"] ?? {}),
      });
    }
    const usageMeta = r["usage_metadata"] as Record<string, unknown> | undefined;
    const usage: LanguageModelV3GenerateResult["usage"] = {
      inputTokens: {
        total: this.coerceNumber(usageMeta?.["input_tokens"]),
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: this.coerceNumber(usageMeta?.["output_tokens"]),
        text: undefined,
        reasoning: undefined,
      },
    };
    const finishReason: LanguageModelV3GenerateResult["finishReason"] =
      toolCalls.length > 0 ? { unified: "tool-calls", raw: "tool-calls" } : { unified: "stop", raw: "stop" };
    return { content, finishReason, usage, warnings: [] };
  }

  private static coerceNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }
}

/**
 * Routes `doGenerate` calls to either the general-purpose `responses` script or, when the AI SDK
 * requests a JSON response via `experimental_output`, the `structuredResponses` script. Records
 * all invocations (messages + options + bound tools) on the supplied {@link ScriptedChatModelCapture}
 * so test assertions can inspect what the agent produced.
 */
class ScriptedDoGenerateFactory {
  static create(
    args: Readonly<{
      responses: ReadonlyArray<unknown>;
      structuredResponses?: ReadonlyArray<unknown>;
      capture: ScriptedChatModelCapture;
    }>,
  ): (options: LanguageModelV3CallOptions) => Promise<LanguageModelV3GenerateResult> {
    let textIndex = 0;
    let structuredIndex = 0;
    return async (options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> => {
      const messages = ScriptedPromptNormalizer.normalize(options.prompt);
      const normalizedOptions = ScriptedCallOptionsNormalizer.normalize(options);
      const toolNames = (options.tools ?? []).map((tool) => tool.name);
      args.capture.recordBoundTools(toolNames.map((name) => ({ name })));
      const isStructuredCall = options.responseFormat?.type === "json" && args.structuredResponses !== undefined;
      if (isStructuredCall) {
        args.capture.recordStructuredInvocation(messages, normalizedOptions);
        args.capture.recordStructuredBinding(options.responseFormat, options.responseFormat);
        const structuredResponse =
          args.structuredResponses?.[structuredIndex] ??
          args.structuredResponses?.[args.structuredResponses.length - 1];
        structuredIndex += 1;
        return {
          content: [{ type: "text", text: JSON.stringify(structuredResponse ?? {}) }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: undefined, text: undefined, reasoning: undefined },
          },
          warnings: [],
        };
      }
      args.capture.recordInvocation(messages, normalizedOptions);
      const response = args.responses[textIndex] ?? args.responses[args.responses.length - 1];
      textIndex += 1;
      return ScriptedResponseConverter.toGenerateResult(response);
    };
  }
}

class ScriptedCallOptionsNormalizer {
  static normalize(options: LanguageModelV3CallOptions): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    if (options.maxOutputTokens !== undefined) {
      normalized["maxTokens"] = options.maxOutputTokens;
    }
    if (options.temperature !== undefined) {
      normalized["temperature"] = options.temperature;
    }
    if (options.providerOptions !== undefined) {
      normalized["providerOptions"] = options.providerOptions;
    }
    return normalized;
  }
}

class ScriptedChatModelFactory implements ChatModelFactory<ScriptedChatModelConfig> {
  create(args: Readonly<{ config: ScriptedChatModelConfig; ctx: NodeExecutionContext<any> }>): ChatLanguageModel {
    const doGenerate = ScriptedDoGenerateFactory.create({
      responses: args.config.responses,
      structuredResponses: args.config.structuredResponses,
      capture: args.config.capture,
    });
    const mock = new MockLanguageModelV3({
      provider: args.config.provider ?? "scripted",
      modelId: args.config.modelName ?? args.config.name,
      doGenerate,
    });
    return {
      languageModel: mock,
      modelName: args.config.modelName ?? args.config.name,
      provider: args.config.provider,
    };
  }
}

class AgentStructuredOutputFixtureFactory {
  static readonly schema = z.object({
    outcome: z.enum(["rfq", "other"]),
    summary: z.string(),
  });

  static createValidOutput(
    overrides?: Partial<z.output<typeof AgentStructuredOutputFixtureFactory.schema>>,
  ): z.output<typeof AgentStructuredOutputFixtureFactory.schema> {
    return {
      outcome: "rfq",
      summary: "RFQ detected",
      ...overrides,
    };
  }
}

class DelayToolConfig implements ToolConfig {
  readonly type = DelayTool;

  constructor(
    public readonly name: string,
    public readonly delayMs: number,
    public readonly matchOn: "subject" | "body",
    public readonly matcher: string,
    public readonly description?: string,
  ) {}
}

class DelayTool implements Tool<DelayToolConfig, typeof delayToolInputSchema, typeof delayToolOutputSchema> {
  readonly defaultDescription = "Check whether the current mail matches the configured RFQ condition.";
  readonly inputSchema = delayToolInputSchema;
  readonly outputSchema = delayToolOutputSchema;
  private static readonly startedAt: number[] = [];
  private static readonly inputsByToolName = new Map<string, ReadonlyArray<z.input<typeof delayToolInputSchema>>>();

  static reset(): void {
    this.startedAt.length = 0;
    this.inputsByToolName.clear();
  }

  static snapshot(): ReadonlyArray<number> {
    return [...this.startedAt];
  }

  static inputsFor(toolName: string): ReadonlyArray<z.input<typeof delayToolInputSchema>> {
    return [...(this.inputsByToolName.get(toolName) ?? [])];
  }

  async execute(
    args: ToolExecuteArgs<DelayToolConfig, z.input<typeof delayToolInputSchema>>,
  ): Promise<z.output<typeof delayToolOutputSchema>> {
    DelayTool.startedAt.push(performance.now());
    const inputs = DelayTool.inputsByToolName.get(args.config.name) ?? [];
    DelayTool.inputsByToolName.set(args.config.name, [...inputs, args.input]);
    await new Promise((resolve) => setTimeout(resolve, args.config.delayMs));
    const subject = args.input.subject ?? String((args.item.json as { subject?: unknown }).subject ?? "");
    const body = args.input.body ?? String((args.item.json as { body?: unknown }).body ?? "");
    const haystack = args.config.matchOn === "subject" ? subject : body;
    const isRfq = haystack.toUpperCase().includes(args.config.matcher.toUpperCase());
    return {
      isRfq,
      reason: `${args.config.matchOn} matched by ${args.config.matcher}`,
    };
  }
}

const delayToolInputSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
});

const delayToolOutputSchema = z.object({
  isRfq: z.boolean(),
  reason: z.string(),
});

class StubCredentialSessionService implements CredentialSessionService {
  async getSession(): Promise<unknown> {
    return "";
  }
}

class MessageInspection {
  static contents(messages: unknown): ReadonlyArray<string> {
    if (!Array.isArray(messages)) {
      return [];
    }
    return messages.map((message) => {
      const candidate = message as Readonly<{ content?: unknown }>;
      if (typeof candidate.content === "string") {
        return candidate.content;
      }
      return JSON.stringify(candidate.content);
    });
  }
}

class ToolCallResponseFactory {
  static toolCall(id: string, name: string, input: unknown, content = "planning"): Readonly<Record<string, unknown>> {
    return {
      content,
      tool_calls: [{ id, name, args: input }],
    };
  }
}

class MailLookupNodeConfig implements RunnableNodeConfig<Record<string, unknown>, Record<string, unknown>> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = MailLookupNode;

  constructor(
    public readonly name: string,
    public readonly matcher: string,
    public readonly id?: string,
  ) {}
}

class MailLookupNode implements RunnableNode<MailLookupNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<MailLookupNodeConfig>): unknown {
    const json = args.item.json as Readonly<{ subject?: string; body?: string }>;
    const subject = String(json.subject ?? "");
    const body = String(json.body ?? "");
    const haystack = `${subject}\n${body}`.toUpperCase();
    const matched = haystack.includes(args.ctx.config.matcher.toUpperCase());
    return {
      json: {
        isRfq: matched,
        reason: matched ? `Matched ${args.ctx.config.matcher}` : `No match for ${args.ctx.config.matcher}`,
        inspectedSubject: subject,
      },
    };
  }
}

class ThrowingNodeConfig implements RunnableNodeConfig<Record<string, unknown>, Record<string, unknown>> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ThrowingNode;

  constructor(
    public readonly name: string,
    public readonly message: string,
    public readonly id?: string,
  ) {}
}

class ThrowingNode implements RunnableNode<ThrowingNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<ThrowingNodeConfig>): Promise<unknown> {
    throw new Error(args.ctx.config.message);
  }
}

class AgentTestRig {
  readonly data = new InMemoryRunDataFactory().create();
  readonly nodeState = new CapturingNodeStatePublisher();
  readonly telemetry = new CapturingNodeTelemetry();
  readonly costTrackingUsages: CostTrackingUsageRecord[] = [];
  readonly container = tsyringeContainer.createChildContainer();

  constructor(
    private readonly config: AIAgent<any, any>,
    registrations: ReadonlyArray<
      Readonly<{ token: unknown; value?: unknown; useClass?: new (...args: unknown[]) => unknown }>
    >,
  ) {
    this.telemetry.costTracking = new CapturingCostTrackingTelemetry(this.telemetry, this.costTrackingUsages);
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
    this.container.registerSingleton(AIAgentNode, AIAgentNode);
    for (const registration of registrations) {
      if (registration.value !== undefined) {
        this.container.registerInstance(registration.token as never, registration.value);
        continue;
      }
      if (registration.useClass) {
        this.container.registerSingleton(registration.token as never, registration.useClass as never);
      }
    }
  }

  async execute(itemsIn: Items, runId = "run_1", nodeId = "agent_1", activationId = "act_1"): Promise<NodeOutputs> {
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
      telemetry: this.telemetry,
      nodeId,
      activationId,
      config: this.config,
      binary: binary.forNode({ nodeId, activationId }),
      getCredential: async () => "",
    };

    const node = this.container.resolve(AIAgentNode);
    const out: Item[] = [];
    for (let i = 0; i < itemsIn.length; i++) {
      const item = itemsIn[i]!;
      const json = await node.execute({
        input: item.json,
        item,
        itemIndex: i,
        items: itemsIn,
        ctx,
      });
      out.push({ ...item, json });
    }
    return { main: out };
  }
}

test("AIAgentNode resolves config tokens, runs tools in parallel, and emits synthetic node states", async () => {
  DelayTool.reset();
  const capture = new ScriptedChatModelCapture();
  const config = new AIAgent({
    name: "Classify (agent)",
    messages: [
      { role: "system", content: "Use tools to classify this mail." },
      { role: "user", content: ({ item }) => JSON.stringify(item.json ?? {}) },
    ],
    chatModel: new ScriptedChatModelConfig(
      "Fake Chat Model",
      [
        {
          content: "planning",
          tool_calls: [
            { id: "tool_1", name: "subject_tool", args: { subject: "RFQ" } },
            { id: "tool_2", name: "body_tool", args: { body: "quote" } },
          ],
        },
        { content: "final answer" },
      ],
      capture,
    ),
    tools: [
      new DelayToolConfig("subject_tool", 40, "subject", "RFQ"),
      new DelayToolConfig("body_tool", 40, "body", "quote"),
    ],
  });
  const rig = new AgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: DelayTool, useClass: DelayTool },
  ]);

  const startedAt = performance.now();
  const outputs = await rig.execute([
    {
      json: {
        subject: "RFQ: 1000 widgets",
        body: "please quote 1000 widgets",
      },
    },
  ]);
  const elapsedMs = performance.now() - startedAt;

  assert.ok(elapsedMs < 120, `expected tool execution to be parallel, elapsed=${elapsedMs}ms`);
  assert.equal(DelayTool.snapshot().length, 2);
  assert.ok(
    Math.abs(DelayTool.snapshot()[0]! - DelayTool.snapshot()[1]!) < 30,
    "expected both tools to start close together",
  );

  const main = outputs.main ?? [];
  assert.equal(main.length, 1);
  assert.deepEqual(main[0]?.json, { output: "final answer" });
  const llmNodeId = ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_1");
  const subjectToolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "subject_tool");
  const bodyToolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "body_tool");
  assert.deepEqual(rig.nodeState.completedOutputsByNodeId.get(llmNodeId)?.main?.[0]?.json, { content: "final answer" });
  assert.deepEqual(DelayTool.inputsFor("subject_tool"), [{ subject: "RFQ" }]);
  assert.deepEqual(DelayTool.inputsFor("body_tool"), [{ body: "quote" }]);
  assert.deepEqual(rig.nodeState.queuedInputsByNodeId.get(subjectToolNodeId)?.in?.[0]?.json, { subject: "RFQ" });
  assert.deepEqual(rig.nodeState.runningInputsByNodeId.get(subjectToolNodeId)?.in?.[0]?.json, { subject: "RFQ" });
  assert.deepEqual(rig.nodeState.completedInputsByNodeId.get(subjectToolNodeId)?.in?.[0]?.json, { subject: "RFQ" });
  assert.deepEqual(rig.nodeState.queuedInputsByNodeId.get(bodyToolNodeId)?.in?.[0]?.json, { body: "quote" });
  assert.deepEqual(rig.nodeState.runningInputsByNodeId.get(bodyToolNodeId)?.in?.[0]?.json, { body: "quote" });
  assert.deepEqual(rig.nodeState.completedInputsByNodeId.get(bodyToolNodeId)?.in?.[0]?.json, { body: "quote" });

  assert.ok(rig.nodeState.events.filter((e) => e === `queued:${llmNodeId}`).length === 2);
  assert.ok(rig.nodeState.events.filter((e) => e === `completed:${llmNodeId}`).length === 2);
  assert.ok(rig.nodeState.events.includes(`queued:${subjectToolNodeId}`));
  assert.ok(rig.nodeState.events.includes(`completed:${subjectToolNodeId}`));
  assert.ok(rig.nodeState.events.includes(`queued:${bodyToolNodeId}`));
  assert.ok(rig.nodeState.events.includes(`completed:${bodyToolNodeId}`));
  assert.deepEqual(capture.snapshotBoundToolNames(), [
    ["subject_tool", "body_tool"],
    ["subject_tool", "body_tool"],
  ]);
});

test("AIAgentNode executes callable tools and emits synthetic tool connection states", async () => {
  const capture = new ScriptedChatModelCapture();
  const callable = callableTool({
    name: "double_n",
    description: "Doubles n",
    inputSchema: z.object({ n: z.number() }),
    outputSchema: z.object({ doubled: z.number() }),
    execute: async ({ input }) => ({ doubled: input.n * 2 }),
  });
  const config = new AIAgent({
    name: "Callable tool agent",
    chatModel: new ScriptedChatModelConfig(
      "Scripted model",
      [
        ToolCallResponseFactory.toolCall("c1", "double_n", { n: 3 }),
        {
          content: JSON.stringify({
            doubledFromTool: 6,
            done: true,
          }),
        },
      ],
      capture,
    ),
    messages: [
      { role: "system", content: "Call double_n once then return strict JSON only." },
      { role: "user", content: ({ item }) => JSON.stringify(item.json ?? {}) },
    ],
    tools: [callable],
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  const outputs = await rig.execute([{ json: { seed: 1 } }], "run_callable", "agent_callable", "act_callable");

  assert.deepEqual(outputs.main?.[0]?.json, {
    doubledFromTool: 6,
    done: true,
  });
  const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_callable", "double_n");
  assert.deepEqual(rig.nodeState.queuedInputsByNodeId.get(toolNodeId)?.in?.[0]?.json, { n: 3 });
  assert.ok(rig.nodeState.events.includes(`completed:${toolNodeId}`));
  assert.equal(capture.snapshotBoundToolNames()[0]?.[0], "double_n");
});

test("AIAgentNode repairs malformed callable tool args inside the same agent loop", async () => {
  const capture = new ScriptedChatModelCapture();
  const callable = callableTool({
    name: "double_n",
    description: "Doubles n",
    inputSchema: z.object({ n: z.number() }),
    outputSchema: z.object({ doubled: z.number() }),
    execute: async ({ input }) => ({ doubled: input.n * 2 }),
  });
  const config = new AIAgent({
    name: "Callable repair agent",
    chatModel: new ScriptedChatModelConfig(
      "Scripted model",
      [
        ToolCallResponseFactory.toolCall("repair_1", "double_n", {}),
        ToolCallResponseFactory.toolCall("repair_2", "double_n", { n: 3 }),
        { content: "repaired final answer" },
      ],
      capture,
    ),
    messages: [
      { role: "system", content: "Call double_n correctly." },
      { role: "user", content: "Go." },
    ],
    tools: [callable],
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  const outputs = await rig.execute([{ json: {} }], "run_repair", "agent_repair", "act_repair");

  assert.deepEqual(outputs.main?.[0]?.json, { output: "repaired final answer" });
  assert.equal(capture.invocations.length, 3);
  const repairMessages = MessageInspection.contents(capture.invocations[1]?.messages);
  assert.equal(
    repairMessages.some((message) => message.includes('"errorType":"validation"')),
    true,
  );
  assert.equal(
    repairMessages.some((message) => message.includes("requiredSchemaReminder")),
    true,
  );
  const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_repair", "double_n");
  const failedInvocation = rig.nodeState.connectionInvocations.find(
    (entry) => entry.connectionNodeId === toolNodeId && entry.status === "failed",
  ) as { error?: { details?: { repair?: { attempt?: number; nextAction?: string } } } } | undefined;
  const completedInvocation = rig.nodeState.connectionInvocations.find(
    (entry) => entry.connectionNodeId === toolNodeId && entry.status === "completed",
  ) as { managedOutput?: unknown } | undefined;
  assert.equal(failedInvocation?.error?.details?.repair?.attempt, 1);
  assert.equal(failedInvocation?.error?.details?.repair?.nextAction, "model_retry_with_tool_error_message");
  assert.deepEqual(completedInvocation?.managedOutput, { doubled: 6 });
  assert.ok(rig.nodeState.events.includes(`failed:${toolNodeId}`));
  assert.ok(rig.nodeState.events.includes(`completed:${toolNodeId}`));
});

test("AIAgentNode fails with an explicit repair exhaustion error after repeated malformed tool args", async () => {
  const capture = new ScriptedChatModelCapture();
  const callable = callableTool({
    name: "double_n",
    description: "Doubles n",
    inputSchema: z.object({ n: z.number() }),
    outputSchema: z.object({ doubled: z.number() }),
    execute: async ({ input }) => ({ doubled: input.n * 2 }),
  });
  const config = new AIAgent({
    name: "Callable repair exhaust",
    chatModel: new ScriptedChatModelConfig(
      "Scripted model",
      [
        ToolCallResponseFactory.toolCall("repair_fail_1", "double_n", {}),
        ToolCallResponseFactory.toolCall("repair_fail_2", "double_n", {}),
      ],
      capture,
    ),
    messages: [
      { role: "system", content: "Call double_n correctly." },
      { role: "user", content: "Go." },
    ],
    tools: [callable],
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  await assert.rejects(
    async () => await rig.execute([{ json: {} }], "run_repair_exhaust", "agent_repair_exhaust", "act_repair_exhaust"),
    /could not recover from invalid tool calls/,
  );

  assert.equal(capture.invocations.length, 2);
  const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_repair_exhaust", "double_n");
  const failedInvocations = rig.nodeState.connectionInvocations.filter(
    (entry) => entry.connectionNodeId === toolNodeId && entry.status === "failed",
  ) as Array<{ error?: { message?: string; details?: { maxAttempts?: number } } }>;
  assert.equal(failedInvocations.length, 2);
  assert.equal(
    failedInvocations.some((entry) => entry.error?.message?.includes("could not recover from invalid tool calls")),
    true,
  );
  assert.equal(failedInvocations[1]?.error?.details?.maxAttempts, 2);
});

test("AIAgentNode keeps successful parallel tool results while repairing malformed sibling calls", async () => {
  const capture = new ScriptedChatModelCapture();
  const doubleTool = callableTool({
    name: "double_n",
    description: "Doubles n",
    inputSchema: z.object({ n: z.number() }),
    outputSchema: z.object({ doubled: z.number() }),
    execute: async ({ input }) => ({ doubled: input.n * 2 }),
  });
  const echoTool = callableTool({
    name: "echo_word",
    description: "Echoes a word",
    inputSchema: z.object({ word: z.string() }),
    outputSchema: z.object({ echoed: z.string() }),
    execute: async ({ input }) => ({ echoed: input.word }),
  });
  const config = new AIAgent({
    name: "Parallel repair agent",
    chatModel: new ScriptedChatModelConfig(
      "Scripted model",
      [
        {
          content: "planning",
          tool_calls: [
            { id: "parallel_1", name: "double_n", args: {} },
            { id: "parallel_2", name: "echo_word", args: { word: "hello" } },
          ],
        },
        ToolCallResponseFactory.toolCall("parallel_3", "double_n", { n: 4 }),
        { content: "parallel repaired final answer" },
      ],
      capture,
    ),
    messages: [
      { role: "system", content: "Use tools." },
      { role: "user", content: "Go." },
    ],
    tools: [doubleTool, echoTool],
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  const outputs = await rig.execute([{ json: {} }], "run_parallel_repair", "agent_parallel_repair", "act_parallel");

  assert.deepEqual(outputs.main?.[0]?.json, { output: "parallel repaired final answer" });
  const doubleNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_parallel_repair", "double_n");
  const echoNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_parallel_repair", "echo_word");
  const echoCompleted = rig.nodeState.connectionInvocations.find(
    (entry) => entry.connectionNodeId === echoNodeId && entry.status === "completed",
  ) as { managedOutput?: unknown } | undefined;
  const doubleFailed = rig.nodeState.connectionInvocations.find(
    (entry) => entry.connectionNodeId === doubleNodeId && entry.status === "failed",
  ) as { error?: { details?: { repair?: { attempt?: number } } } } | undefined;
  const doubleCompleted = rig.nodeState.connectionInvocations.find(
    (entry) => entry.connectionNodeId === doubleNodeId && entry.status === "completed",
  ) as { managedOutput?: unknown } | undefined;
  assert.deepEqual(echoCompleted?.managedOutput, { echoed: "hello" });
  assert.equal(doubleFailed?.error?.details?.repair?.attempt, 1);
  assert.deepEqual(doubleCompleted?.managedOutput, { doubled: 8 });
  const secondTurnMessages = MessageInspection.contents(capture.invocations[1]?.messages);
  assert.equal(
    secondTurnMessages.some((message) => message.includes('"echoed":"hello"')),
    true,
  );
  assert.equal(
    secondTurnMessages.some((message) => message.includes('"errorType":"validation"')),
    true,
  );
});

test("AIAgentNode callable tool uses item only when execute reads it explicitly", async () => {
  const capture = new ScriptedChatModelCapture();
  const callable = callableTool({
    name: "merge_explicit",
    inputSchema: z.object({ hint: z.string() }),
    outputSchema: z.object({ combined: z.string() }),
    execute: async ({ input, item }) => ({
      combined: `${String((item.json as { topic?: unknown }).topic ?? "")}:${input.hint}`,
    }),
  });
  const config = new AIAgent({
    name: "Explicit merge",
    chatModel: new ScriptedChatModelConfig(
      "Scripted model",
      [ToolCallResponseFactory.toolCall("m1", "merge_explicit", { hint: "x" }), { content: '{"ok":true}' }],
      capture,
    ),
    messages: [
      { role: "system", content: "Use merge_explicit." },
      { role: "user", content: "go" },
    ],
    tools: [callable],
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  await rig.execute([{ json: { topic: "T1" } }], "run_merge", "agent_merge", "act_merge");

  const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_merge", "merge_explicit");
  assert.deepEqual(rig.nodeState.completedOutputsByNodeId.get(toolNodeId)?.main?.[0]?.json, {
    combined: "T1:x",
  });
});

test("AIAgentNode fails callable tool when outputSchema validation fails", async () => {
  const config = new AIAgent({
    name: "Bad callable output",
    chatModel: new ScriptedChatModelConfig("Scripted model", [ToolCallResponseFactory.toolCall("b1", "bad_out", {})]),
    messages: [
      { role: "system", content: "Use tool." },
      { role: "user", content: "x" },
    ],
    tools: [
      callableTool({
        name: "bad_out",
        inputSchema: z.object({}),
        outputSchema: z.object({ out: z.string() }),
        execute: async () => ({ out: 123 }) as { out: string },
      }),
    ],
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  await assert.rejects(async () => await rig.execute([{ json: {} }], "run_bad", "agent_bad", "act_bad"), /Invalid/);
  const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_bad", "bad_out");
  assert.ok(rig.nodeState.events.includes(`failed:${toolNodeId}`));
});

test("AIAgentNode executes node-backed tools with default output mapping and current-item input merging", async () => {
  const capture = new ScriptedChatModelCapture();
  const config = new AIAgent({
    name: "Mail triage",
    chatModel: new ScriptedChatModelConfig(
      "Scripted model",
      [
        ToolCallResponseFactory.toolCall("lookup_1", "lookup_mail", { body: "quote" }),
        {
          content: JSON.stringify({
            outcome: "rfq",
            summary: "RFQ confirmed from node-backed tool",
          }),
        },
      ],
      capture,
    ),
    messages: [
      { role: "system", content: "Classify mail and return strict JSON only." },
      {
        role: "user",
        content: ({ item }) => JSON.stringify(item.json),
      },
    ],
    tools: [
      AgentToolFactory.asTool(new MailLookupNodeConfig("Lookup mail", "RFQ"), {
        name: "lookup_mail",
        description: "Inspect the current mail for RFQ signals.",
        inputSchema: z.object({
          body: z.string(),
        }),
        outputSchema: z.object({
          isRfq: z.boolean(),
          reason: z.string(),
          inspectedSubject: z.string(),
        }),
        mapInput: ({ input, item }) => ({
          subject: String((item.json as { subject?: unknown }).subject ?? ""),
          body: input.body,
        }),
      }),
    ],
  });
  const rig = new AgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: MailLookupNode, useClass: MailLookupNode },
  ]);

  const outputs = await rig.execute([
    {
      json: {
        subject: "RFQ: 1000 widgets",
        body: "please quote 1000 widgets",
      },
    },
  ]);

  assert.deepEqual(outputs.main?.[0]?.json, {
    outcome: "rfq",
    summary: "RFQ confirmed from node-backed tool",
  });
  const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "lookup_mail");
  assert.deepEqual(rig.nodeState.queuedInputsByNodeId.get(toolNodeId)?.in?.[0]?.json, { body: "quote" });
  assert.equal(capture.snapshotBoundToolNames()[0]?.[0], "lookup_mail");
});

test("AIAgentNode normalizes prompt and buildMessages in order and passes model invocation options", async () => {
  const capture = new ScriptedChatModelCapture();
  const config = new AIAgent({
    name: "Message authoring",
    chatModel: new ScriptedChatModelConfig("Scripted model", [{ content: "done" }], capture),
    messages: {
      prompt: [
        { role: "system", content: "Stable instructions" },
        {
          role: "user",
          content: ({ item }) => `Subject: ${String((item.json as { subject?: unknown }).subject ?? "")}`,
        },
      ],
      buildMessages: ({ itemIndex, items }): ReadonlyArray<AgentMessageDto> => [
        {
          role: "assistant",
          content: `Previously processed: ${itemIndex}/${items.length}`,
        },
      ],
    },
    guardrails: {
      modelInvocationOptions: {
        maxTokens: 123,
        providerOptions: {
          mode: "json",
        },
      },
    },
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  await rig.execute([{ json: { subject: "RFQ request" } }], "run_messages", "agent_messages", "act_messages");

  assert.deepEqual(MessageInspection.contents(capture.invocations[0]?.messages), [
    "Stable instructions",
    "Subject: RFQ request",
    "Previously processed: 0/1",
  ]);
  assert.deepEqual(capture.invocations[0]?.options, {
    maxTokens: 123,
    providerOptions: {
      mode: "json",
    },
  });
});

test("AIAgentNode can stop at maxTurns and fall back to the last model message", async () => {
  const config = new AIAgent({
    name: "Guardrailed agent",
    chatModel: new ScriptedChatModelConfig("Scripted model", [
      ToolCallResponseFactory.toolCall("lookup_1", "lookup_mail", { body: "quote" }, "tool plan"),
    ]),
    messages: [
      { role: "system", content: "Use tools when needed." },
      { role: "user", content: "Inspect this message." },
    ],
    guardrails: {
      maxTurns: 1,
      onTurnLimitReached: "respondWithLastMessage",
    },
    tools: [
      AgentToolFactory.asTool(new MailLookupNodeConfig("Lookup mail", "RFQ"), {
        name: "lookup_mail",
        description: "Inspect the current mail for RFQ signals.",
        inputSchema: z.object({
          body: z.string(),
        }),
        outputSchema: z.object({
          isRfq: z.boolean(),
          reason: z.string(),
          inspectedSubject: z.string(),
        }),
      }),
    ],
  });
  const rig = new AgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: MailLookupNode, useClass: MailLookupNode },
  ]);

  const outputs = await rig.execute([{ json: { body: "please quote 1000 widgets" } }], "run_guardrail");

  assert.deepEqual(outputs.main?.[0]?.json, { output: "tool plan" });
  assert.equal(
    rig.nodeState.events.includes(`queued:${ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "lookup_mail")}`),
    false,
  );
});

test("AIAgentNode marks tool connection failures when a node-backed tool throws", async () => {
  const config = new AIAgent({
    name: "Failing node-backed tool",
    chatModel: new ScriptedChatModelConfig("Scripted model", [
      ToolCallResponseFactory.toolCall("fail_1", "explode_tool", { any: "value" }),
    ]),
    messages: [
      { role: "system", content: "Use the tool." },
      { role: "user", content: "Trigger failure." },
    ],
    tools: [
      AgentToolFactory.asTool(new ThrowingNodeConfig("Explode tool", "tool exploded"), {
        name: "explode_tool",
        description: "Always fails.",
        inputSchema: z.object({
          any: z.string(),
        }),
        outputSchema: z.object({
          ok: z.boolean(),
        }),
      }),
    ],
  });
  const rig = new AgentTestRig(config, [
    { token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory },
    { token: ThrowingNode, useClass: ThrowingNode },
  ]);

  await assert.rejects(async () => await rig.execute([{ json: { body: "failure" } }], "run_failure"), /tool exploded/);

  const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "explode_tool");
  assert.ok(rig.nodeState.events.includes(`failed:${toolNodeId}`));
  assert.equal(
    rig.nodeState.connectionInvocations.some(
      (entry) =>
        entry.connectionNodeId === toolNodeId &&
        entry.status === "failed" &&
        (entry.error as { message?: string } | undefined)?.message === "tool exploded",
    ),
    true,
  );
});

test("AIAgentNode marks tool connection failures when a callable tool execute throws", async () => {
  const config = new AIAgent({
    name: "Failing callable tool",
    chatModel: new ScriptedChatModelConfig("Scripted model", [
      ToolCallResponseFactory.toolCall("fail_1", "explode_callable", { any: "value" }),
    ]),
    messages: [
      { role: "system", content: "Use the tool." },
      { role: "user", content: "Trigger failure." },
    ],
    tools: [
      callableTool({
        name: "explode_callable",
        description: "Always fails.",
        inputSchema: z.object({
          any: z.string(),
        }),
        outputSchema: z.object({
          ok: z.boolean(),
        }),
        execute: async () => {
          throw new Error("callable exploded");
        },
      }),
    ],
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  await assert.rejects(
    async () => await rig.execute([{ json: { body: "failure" } }], "run_callable_fail"),
    /callable exploded/,
  );

  const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "explode_callable");
  assert.ok(rig.nodeState.events.includes(`failed:${toolNodeId}`));
  assert.equal(
    rig.nodeState.connectionInvocations.some(
      (entry) =>
        entry.connectionNodeId === toolNodeId &&
        entry.status === "failed" &&
        (entry.error as { message?: string } | undefined)?.message === "callable exploded",
    ),
    true,
  );
});

test("AIAgentNode returns validated structured output when final content already matches outputSchema", async () => {
  const config = new AIAgent({
    name: "Structured direct parse",
    chatModel: new ScriptedChatModelConfig("Scripted model", [
      { content: JSON.stringify(AgentStructuredOutputFixtureFactory.createValidOutput()) },
    ]),
    messages: [
      { role: "system", content: "Return structured output." },
      { role: "user", content: "Classify this mail." },
    ],
    outputSchema: AgentStructuredOutputFixtureFactory.schema,
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  const outputs = await rig.execute([{ json: { subject: "RFQ", body: "Need quote" } }], "run_structured_direct");

  assert.deepEqual(outputs.main?.[0]?.json, AgentStructuredOutputFixtureFactory.createValidOutput());
});

test("AIAgentNode uses native structured output when the model supports it", async () => {
  const capture = new ScriptedChatModelCapture();
  const config = new AIAgent({
    name: "Structured native",
    chatModel: new ScriptedChatModelConfig(
      "Scripted native model",
      [{ content: "unstructured final answer" }],
      capture,
      [AgentStructuredOutputFixtureFactory.createValidOutput({ summary: "Native structured result" })],
    ),
    messages: [
      { role: "system", content: "Return structured output." },
      { role: "user", content: "Classify this mail." },
    ],
    outputSchema: AgentStructuredOutputFixtureFactory.schema,
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  const outputs = await rig.execute([{ json: { subject: "RFQ", body: "Need quote" } }], "run_structured_native");

  assert.deepEqual(outputs.main?.[0]?.json, {
    outcome: "rfq",
    summary: "Native structured result",
  });
  assert.equal(capture.structuredInvocations.length, 1);
  assert.equal(capture.structuredBindings.length, 1);
});

test("AIAgentNode retries with a repair prompt when structured output parsing fails", async () => {
  const capture = new ScriptedChatModelCapture();
  const config = new AIAgent({
    name: "Structured repair",
    chatModel: new ScriptedChatModelConfig(
      "Scripted model",
      [
        { content: "plain text result" },
        { content: JSON.stringify(AgentStructuredOutputFixtureFactory.createValidOutput({ summary: "Recovered" })) },
      ],
      capture,
    ),
    messages: [
      { role: "system", content: "Return structured output." },
      { role: "user", content: "Classify this mail." },
    ],
    outputSchema: AgentStructuredOutputFixtureFactory.schema,
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  const outputs = await rig.execute([{ json: { subject: "RFQ", body: "Need quote" } }], "run_structured_repair");

  assert.deepEqual(outputs.main?.[0]?.json, {
    outcome: "rfq",
    summary: "Recovered",
  });
  assert.equal(capture.invocations.length, 2);
  const repairMessages = MessageInspection.contents(capture.invocations[1]?.messages);
  assert.equal(
    repairMessages.some((message) => message.includes("validationError")),
    true,
  );
  assert.equal(
    repairMessages.some((message) => message.includes("requiredSchema")),
    true,
  );
});

test("AIAgentNode throws instead of returning legacy string output when outputSchema is set", async () => {
  const config = new AIAgent({
    name: "Structured failure",
    chatModel: new ScriptedChatModelConfig("Scripted model", [
      { content: "plain text result" },
      { content: "still plain text" },
      { content: "still plain text" },
    ]),
    messages: [
      { role: "system", content: "Return structured output." },
      { role: "user", content: "Classify this mail." },
    ],
    outputSchema: AgentStructuredOutputFixtureFactory.schema,
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  await assert.rejects(
    async () => await rig.execute([{ json: { subject: "RFQ", body: "Need quote" } }], "run_structured_fail"),
    /Structured output required/,
  );
});

test("AIAgentNode finalizes tool-enabled runs into validated structured output", async () => {
  const capture = new ScriptedChatModelCapture();
  const callable = callableTool({
    name: "double_n",
    description: "Doubles n",
    inputSchema: z.object({ n: z.number() }),
    outputSchema: z.object({ doubled: z.number() }),
    execute: async ({ input }) => ({ doubled: input.n * 2 }),
  });
  const config = new AIAgent({
    name: "Structured tool finalize",
    chatModel: new ScriptedChatModelConfig(
      "Scripted model",
      [
        ToolCallResponseFactory.toolCall("c1", "double_n", { n: 3 }),
        { content: "tool finished" },
        {
          content: JSON.stringify(AgentStructuredOutputFixtureFactory.createValidOutput({ summary: "Tool verified" })),
        },
      ],
      capture,
    ),
    messages: [
      { role: "system", content: "Call the tool then return structured output." },
      { role: "user", content: "Go." },
    ],
    tools: [callable],
    outputSchema: AgentStructuredOutputFixtureFactory.schema,
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  const outputs = await rig.execute([{ json: { seed: 1 } }], "run_structured_tool", "agent_structured_tool");

  assert.deepEqual(outputs.main?.[0]?.json, {
    outcome: "rfq",
    summary: "Tool verified",
  });
  assert.equal(capture.snapshotBoundToolNames()[0]?.[0], "double_n");
});

test("AIAgentNode records telemetry for turns, tokens, and child invocation artifacts", async () => {
  const config = new AIAgent({
    name: "Telemetry agent",
    chatModel: Object.assign(
      new ScriptedChatModelConfig("OpenAI", [
        {
          content: "All done",
          usage_metadata: {
            input_tokens: 11,
            output_tokens: 7,
            total_tokens: 18,
          },
        },
      ]),
      { provider: "openai", modelName: "gpt-4.1-nano" },
    ),
    messages: [{ role: "user", content: "Summarize" }],
  });
  const rig = new AgentTestRig(config, [{ token: ScriptedChatModelFactory, useClass: ScriptedChatModelFactory }]);

  const outputs = await rig.execute([{ json: { topic: "telemetry" } }]);

  assert.deepEqual(outputs.main?.[0]?.json, { output: "All done" });
  assert.deepEqual(
    rig.telemetry.metrics.map((metric) => [metric.name, metric.value]),
    [
      ["codemation.ai.turns", 1],
      ["codemation.ai.tool_calls", 0],
    ],
  );
  assert.equal(rig.telemetry.childSpans().length, 1);
  assert.deepEqual(
    rig.telemetry.childSpans()[0]?.metrics.map((metric) => [metric.name, metric.value]),
    [
      ["gen_ai.usage.input_tokens", 11],
      ["gen_ai.usage.output_tokens", 7],
      ["gen_ai.usage.total_tokens", 18],
      ["codemation.cost.estimated", 11_000],
      ["codemation.cost.estimated", 14_000],
    ],
  );
  assert.equal(rig.telemetry.childSpans()[0]?.initialAttributes?.["gen_ai.request.model"], "gpt-4.1-nano");
  assert.deepEqual(rig.costTrackingUsages, [
    {
      component: "chat",
      provider: "openai",
      operation: "completion.input",
      pricingKey: "gpt-4.1-nano",
      usageUnit: "input_tokens",
      quantity: 11,
      modelName: "gpt-4.1-nano",
    },
    {
      component: "chat",
      provider: "openai",
      operation: "completion.output",
      pricingKey: "gpt-4.1-nano",
      usageUnit: "output_tokens",
      quantity: 7,
      modelName: "gpt-4.1-nano",
    },
  ]);
  assert.equal(rig.telemetry.childSpans()[0]?.artifacts.length, 2);
  assert.equal(rig.telemetry.childSpans()[0]?.ended[0]?.status, "ok");
});
