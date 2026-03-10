import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import type {
  ChatModelConfig,
  ChatModelFactory,
  LangChainChatModelLike,
  NodeExecutionContext,
  NodeExecutionStatePublisher,
  NodeInputsByPort,
  NodeOutputs,
  Tool,
  ToolConfig,
  ToolExecuteArgs,
} from "@codemation/core";
import { InMemoryCredentialService, InMemoryRunDataFactory, SimpleContainerFactory } from "@codemation/core";
import { AIAgent, AIAgentNode } from "@codemation/core-nodes";
import { z } from "zod";

class CapturingNodeStatePublisher implements NodeExecutionStatePublisher {
  readonly events: string[] = [];

  async markQueued(args: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort }): Promise<void> {
    this.events.push(`queued:${args.nodeId}`);
  }

  async markRunning(args: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort }): Promise<void> {
    this.events.push(`running:${args.nodeId}`);
  }

  async markCompleted(args: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort; outputs?: NodeOutputs }): Promise<void> {
    this.events.push(`completed:${args.nodeId}`);
  }

  async markFailed(args: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort; error: Error }): Promise<void> {
    this.events.push(`failed:${args.nodeId}`);
  }
}

class FakeChatModelConfig implements ChatModelConfig {
  readonly token = FakeChatModelFactory;

  constructor(public readonly name: string) {}
}

class FakeLangChainChatModel implements LangChainChatModelLike {
  private invocationCount = 0;

  bindTools(_: ReadonlyArray<unknown>): LangChainChatModelLike {
    return this;
  }

  async invoke(_: unknown): Promise<unknown> {
    this.invocationCount += 1;
    if (this.invocationCount === 1) {
      return {
        content: "planning",
        tool_calls: [
          { id: "tool_1", name: "subject_tool", args: { subject: "RFQ" } },
          { id: "tool_2", name: "body_tool", args: { body: "quote" } },
        ],
      };
    }

    return {
      content: "final answer",
    };
  }
}

class FakeChatModelFactory implements ChatModelFactory<FakeChatModelConfig> {
  create(_: Readonly<{ config: FakeChatModelConfig; ctx: NodeExecutionContext<any> }>): LangChainChatModelLike {
    return new FakeLangChainChatModel();
  }
}

class DelayToolConfig implements ToolConfig {
  readonly token = DelayTool;

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

  static reset(): void {
    this.startedAt.length = 0;
  }

  static snapshot(): ReadonlyArray<number> {
    return [...this.startedAt];
  }

  async execute(args: ToolExecuteArgs<DelayToolConfig, z.input<typeof delayToolInputSchema>>): Promise<z.output<typeof delayToolOutputSchema>> {
    DelayTool.startedAt.push(performance.now());
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

test("AIAgentNode resolves config tokens, runs tools in parallel, and emits synthetic node states", async () => {
  DelayTool.reset();
  const data = new InMemoryRunDataFactory().create();
  const nodeState = new CapturingNodeStatePublisher();
  const container = SimpleContainerFactory.create();
  const config = new AIAgent(
    "Classify (agent)",
    "Use tools to classify this mail.",
    (item) => JSON.stringify(item.json ?? {}),
    new FakeChatModelConfig("Fake Chat Model"),
    [
      new DelayToolConfig("subject_tool", 40, "subject", "RFQ"),
      new DelayToolConfig("body_tool", 40, "body", "quote"),
    ],
  );
  const ctx: NodeExecutionContext<AIAgent> = {
    runId: "run_1",
    workflowId: "wf_1",
    parent: undefined,
    now: () => new Date(),
    services: {
      credentials: new InMemoryCredentialService(),
      container,
      nodeState,
    },
    data,
    nodeId: "agent_1",
    activationId: "act_1",
    config,
  };

  const startedAt = performance.now();
  const outputs = await new AIAgentNode().execute(
    [
      {
        json: {
          subject: "RFQ: 1000 widgets",
          body: "please quote 1000 widgets",
        },
      },
    ],
    ctx,
  );
  const elapsedMs = performance.now() - startedAt;

  assert.ok(elapsedMs < 80, `expected tool execution to be parallel, elapsed=${elapsedMs}ms`);
  assert.equal(DelayTool.snapshot().length, 2);
  assert.ok(Math.abs(DelayTool.snapshot()[0]! - DelayTool.snapshot()[1]!) < 30, "expected both tools to start close together");

  const main = outputs.main ?? [];
  assert.equal(main.length, 1);
  const resultJson = main[0]?.json as { agentResult?: { content?: string; toolResults?: ReadonlyArray<{ isRfq: boolean }> }; classification?: { isRfq?: boolean } };
  assert.equal(resultJson.agentResult?.content, "final answer");
  assert.equal(resultJson.classification?.isRfq, true);
  assert.equal(resultJson.agentResult?.toolResults?.length, 2);

  assert.ok(nodeState.events.includes("queued:agent_1::llm"));
  assert.ok(nodeState.events.includes("completed:agent_1::llm"));
  assert.ok(nodeState.events.includes("queued:agent_1::tool::subject_tool"));
  assert.ok(nodeState.events.includes("completed:agent_1::tool::subject_tool"));
  assert.ok(nodeState.events.includes("queued:agent_1::tool::body_tool"));
  assert.ok(nodeState.events.includes("completed:agent_1::tool::body_tool"));
});
