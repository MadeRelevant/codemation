import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";

import { container as tsyringeContainer } from "tsyringe";
import { InMemoryWorkflowRegistry, PersistedWorkflowResolver, PersistedWorkflowSnapshotFactory, WorkflowBuilder } from "../dist/index.js";
import type {
  ChatModelConfig,
  ChatModelFactory,
  Items,
  LangChainChatModelLike,
  Node,
  NodeExecutionContext,
  NodeOutputs,
  RunnableNodeConfig,
  Tool,
  ToolConfig,
  ToolExecuteArgs,
  TypeToken,
} from "../dist/index.js";
import { createEngineTestKit, items } from "./harness/index.ts";

class StableTokenIds {
  static readonly chatModel = "codemation.test.roundtrip.chat-model";
  static readonly tool = "codemation.test.roundtrip.tool";
  static readonly node = "codemation.test.roundtrip.node";
}

class StableChatModelConfig implements ChatModelConfig {
  readonly token: TypeToken<unknown> = StableChatModelFactory;
  readonly tokenId = StableTokenIds.chatModel;

  constructor(public readonly name: string) {}
}

class StableChatModelFactory implements ChatModelFactory<StableChatModelConfig> {
  create(): LangChainChatModelLike {
    return new StableLangChainChatModel();
  }
}

class StableLangChainChatModel implements LangChainChatModelLike {
  async invoke(): Promise<unknown> {
    return { content: "ok" };
  }
}

class StableToolConfig implements ToolConfig {
  readonly token: TypeToken<unknown> = StableTool;
  readonly tokenId = StableTokenIds.tool;

  constructor(
    public readonly name: string,
    public readonly description?: string,
  ) {}
}

class StableTool implements Tool<StableToolConfig> {
  readonly defaultDescription = "stable tool";
  readonly inputSchema = {
    parse(input: unknown): unknown {
      return input;
    },
  } as Tool<StableToolConfig>["inputSchema"];
  readonly outputSchema = {
    parse(input: unknown): unknown {
      return input;
    },
  } as Tool<StableToolConfig>["outputSchema"];

  async execute(args: ToolExecuteArgs<StableToolConfig, unknown>): Promise<unknown> {
    return { tool: args.config.name };
  }
}

class StableResolvableNodeConfig implements RunnableNodeConfig<Record<string, unknown>, Record<string, unknown>> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = StableResolvableNode;
  readonly tokenId = StableTokenIds.node;

  constructor(
    public readonly name: string,
    public readonly chatModel: StableChatModelConfig,
    public readonly tools: ReadonlyArray<StableToolConfig>,
    public readonly id?: string,
  ) {}
}

class StableResolvableNode implements Node<StableResolvableNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(itemsIn: Items, ctx: NodeExecutionContext<StableResolvableNodeConfig>): Promise<NodeOutputs> {
    const container = ctx.services.container;
    assert.ok(container);

    const chatModelFactory = container.resolve(ctx.config.chatModel.token) as StableChatModelFactory;
    const resolvedToolNames = ctx.config.tools.map((toolConfig) => {
      const tool = container.resolve(toolConfig.token) as StableTool;
      assert.ok(tool instanceof StableTool);
      return toolConfig.name;
    });

    assert.ok(chatModelFactory instanceof StableChatModelFactory);
    return {
      main: itemsIn.map((item) => ({
        ...item,
        json: {
          ...(item.json as Record<string, unknown>),
          resolvedChatModel: ctx.config.chatModel.name,
          resolvedTools: resolvedToolNames,
        },
      })),
    };
  }
}

class StableWorkflowFixtureFactory {
  static createWorkflow() {
    return new WorkflowBuilder({ id: "wf.stable.roundtrip", name: "Stable snapshot roundtrip" })
      .start(
        new StableResolvableNodeConfig(
          "Resolve dependencies",
          new StableChatModelConfig("Stable chat model"),
          [new StableToolConfig("lookup_tool", "Lookup tool")],
          "resolve",
        ),
      )
      .build();
  }
}

class SnapshotConfigReader {
  static asRecord(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Readonly<Record<string, unknown>>;
  }
}

test("workflow builder produces a compiled workflow whose node and nested dependency tokens resolve cleanly", async () => {
  const container = tsyringeContainer.createChildContainer();
  const workflow = StableWorkflowFixtureFactory.createWorkflow();
  const providers = new Map<TypeToken<unknown>, unknown>([
    [StableResolvableNode, new StableResolvableNode()],
    [StableChatModelFactory, new StableChatModelFactory()],
    [StableTool, new StableTool()],
  ]);
  const kit = createEngineTestKit({ container, providers });

  await kit.start([workflow]);

  const compiledNode = workflow.nodes[0];
  assert.ok(compiledNode);
  assert.equal(compiledNode.tokenId, StableTokenIds.node);
  assert.equal(compiledNode.config.tokenId, StableTokenIds.node);
  assert.ok(container.resolve(compiledNode.token) instanceof StableResolvableNode);

  const config = compiledNode.config as StableResolvableNodeConfig;
  assert.ok(container.resolve(config.chatModel.token) instanceof StableChatModelFactory);
  assert.ok(container.resolve(config.tools[0]!.token) instanceof StableTool);

  const result = await kit.runToCompletion({
    wf: workflow,
    startAt: compiledNode.id,
    items: items([{ hello: "world" }]),
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.outputs.map((item) => item.json), [
    {
      hello: "world",
      resolvedChatModel: "Stable chat model",
      resolvedTools: ["lookup_tool"],
    },
  ]);
});

test("builder snapshot roundtrip preserves persisted workflow identity without drift", () => {
  const workflow = StableWorkflowFixtureFactory.createWorkflow();
  const snapshotFactory = new PersistedWorkflowSnapshotFactory();
  const originalSnapshot = snapshotFactory.create(workflow);
  const registry = new InMemoryWorkflowRegistry();

  registry.setWorkflows([workflow]);

  const resolvedWorkflow = new PersistedWorkflowResolver(registry).resolve({
    workflowId: workflow.id,
    workflowSnapshot: originalSnapshot,
  });
  assert.ok(resolvedWorkflow);

  const roundTrippedSnapshot = snapshotFactory.create(resolvedWorkflow);
  assert.deepEqual(roundTrippedSnapshot, originalSnapshot);

  const nodeSnapshot = originalSnapshot.nodes[0];
  assert.ok(nodeSnapshot);
  assert.equal(nodeSnapshot.nodeTokenId, StableTokenIds.node);
  assert.equal(nodeSnapshot.configTokenId, StableTokenIds.node);
  const configRecord = SnapshotConfigReader.asRecord(nodeSnapshot.config);
  const chatModelRecord = SnapshotConfigReader.asRecord(configRecord.chatModel);
  const toolRecord = SnapshotConfigReader.asRecord((configRecord.tools as ReadonlyArray<unknown> | undefined)?.[0]);
  assert.equal(chatModelRecord.tokenId, StableTokenIds.chatModel);
  assert.equal(toolRecord.tokenId, StableTokenIds.tool);
});
