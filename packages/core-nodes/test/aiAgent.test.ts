import type {
  AgentMessageDto,
  ChatModelConfig,
  ChatModelFactory,
  CredentialSessionService,
  Item,
  Items,
  LangChainChatModelLike,
  NodeExecutionContext,
  NodeExecutionStatePublisher,
  NodeInputsByPort,
  NodeOutputs,
  RunnableNodeConfig,
  Tool,
  ToolConfig,
  ToolExecuteArgs,
  TypeToken,
} from "@codemation/core";
import {
  AgentToolFactory,
  ConnectionNodeIdFactory,
  CoreTokens,
  container as tsyringeContainer,
} from "@codemation/core";

import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";
import { AIAgent, AIAgentExecutionHelpersFactory, AIAgentNode } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "vitest";
import { z } from "zod";
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

class ScriptedChatModelCapture {
  readonly invocations: Array<Readonly<{ messages: unknown; options: unknown }>> = [];
  readonly boundToolNames: ReadonlyArray<ReadonlyArray<string>> = [];

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
  ) {}
}

class ScriptedLangChainChatModel implements LangChainChatModelLike {
  private invocationCount = 0;

  constructor(
    private readonly responses: ReadonlyArray<unknown>,
    private readonly capture: ScriptedChatModelCapture,
  ) {}

  bindTools(tools: ReadonlyArray<unknown>): LangChainChatModelLike {
    this.capture.recordBoundTools(tools);
    return this;
  }

  async invoke(messages: unknown, options?: unknown): Promise<unknown> {
    this.capture.recordInvocation(messages, options);
    const response = this.responses[this.invocationCount] ?? this.responses[this.responses.length - 1];
    this.invocationCount += 1;
    return response ?? { content: "" };
  }
}

class ScriptedChatModelFactory implements ChatModelFactory<ScriptedChatModelConfig> {
  create(args: Readonly<{ config: ScriptedChatModelConfig; ctx: NodeExecutionContext<any> }>): LangChainChatModelLike {
    return new ScriptedLangChainChatModel(args.config.responses, args.config.capture);
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

class MailLookupNode implements Node<MailLookupNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<MailLookupNodeConfig>): Promise<NodeOutputs> {
    return {
      main: items.map((item) => {
        const json = item.json as Readonly<{ subject?: string; body?: string }>;
        const subject = String(json.subject ?? "");
        const body = String(json.body ?? "");
        const haystack = `${subject}\n${body}`.toUpperCase();
        const matched = haystack.includes(ctx.config.matcher.toUpperCase());
        return {
          json: {
            isRfq: matched,
            reason: matched ? `Matched ${ctx.config.matcher}` : `No match for ${ctx.config.matcher}`,
            inspectedSubject: subject,
          },
        };
      }),
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

class ThrowingNode implements Node<ThrowingNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(_: Items, ctx: NodeExecutionContext<ThrowingNodeConfig>): Promise<NodeOutputs> {
    throw new Error(ctx.config.message);
  }
}

class AgentTestRig {
  readonly data = new InMemoryRunDataFactory().create();
  readonly nodeState = new CapturingNodeStatePublisher();
  readonly container = tsyringeContainer.createChildContainer();

  constructor(
    private readonly config: AIAgent<any, any>,
    registrations: ReadonlyArray<
      Readonly<{ token: unknown; value?: unknown; useClass?: new (...args: unknown[]) => unknown }>
    >,
  ) {
    this.container.registerInstance(CoreTokens.CredentialSessionService, new StubCredentialSessionService());
    this.container.registerInstance(CoreTokens.NodeResolver, this.container);
    this.container.registerSingleton(AIAgentExecutionHelpersFactory, AIAgentExecutionHelpersFactory);
    this.container.registerSingleton(NodeBackedToolRuntime, NodeBackedToolRuntime);
    this.container.registerSingleton(AIAgentNode, AIAgentNode);
    for (const registration of registrations) {
      if (registration.value !== undefined) {
        this.container.registerInstance(registration.token as never, registration.value);
        continue;
      }
      if (registration.useClass) {
        this.container.register(registration.token as never, { useClass: registration.useClass as never });
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
      const json = await node.executeOne({
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

  assert.ok(elapsedMs < 80, `expected tool execution to be parallel, elapsed=${elapsedMs}ms`);
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
  assert.deepEqual(capture.snapshotBoundToolNames(), [["subject_tool", "body_tool"]]);
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
