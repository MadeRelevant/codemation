import assert from "node:assert/strict";
import { test } from "vitest";
import "reflect-metadata";

import { container as tsyringeContainer } from "tsyringe";
import type {
  ChatModelConfig,
  ChatModelFactory,
  Items,
  LangChainChatModelLike,
  Node,
  NodeExecutionContext,
  NodeOutputs,
  NodeResolver,
  RunnableNodeConfig,
  Tool,
  ToolConfig,
  ToolExecuteArgs,
  TypeToken,
} from "../../src/index.ts";
import { PersistedWorkflowTokenRegistry } from "../../src/bootstrap/index.ts";
import { AgentToolFactory, WorkflowBuilder, chatModel, node, tool } from "../../src/index.ts";
import { InMemoryLiveWorkflowRepository, PersistedWorkflowSnapshotFactory } from "../../src/testing.ts";
import { MissingRuntimeFallbacks } from "../../src/workflowSnapshots/MissingRuntimeFallbacksFactory";
import { WorkflowSnapshotCodec } from "../../src/workflowSnapshots/WorkflowSnapshotCodec";
import { WorkflowSnapshotResolver } from "../../src/workflowSnapshots/WorkflowSnapshotResolver";
import { createEngineTestKit, items } from "../harness/index.ts";

class StableChatModelConfig implements ChatModelConfig {
  readonly type: TypeToken<unknown> = StableChatModelFactory;

  constructor(public readonly name: string) {}
}

@chatModel({ packageName: "@codemation/test" })
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
  readonly type: TypeToken<unknown> = StableTool;

  constructor(
    public readonly name: string,
    public readonly description?: string,
  ) {}
}

@tool({ packageName: "@codemation/test" })
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

class StableToolNodeConfig implements RunnableNodeConfig<Record<string, unknown>, Record<string, unknown>> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = StableToolNode;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}
}

@node({ packageName: "@codemation/test" })
class StableToolNode implements Node<StableToolNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(itemsIn: Items, _ctx: NodeExecutionContext<StableToolNodeConfig>): Promise<NodeOutputs> {
    return {
      main: itemsIn.map((item) => ({
        json: {
          echoed: (item.json as Record<string, unknown>).query ?? "missing",
          fromNode: true,
        },
      })),
    };
  }
}

class StableResolvableNodeConfig implements RunnableNodeConfig<Record<string, unknown>, Record<string, unknown>> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = StableResolvableNode;

  constructor(
    public readonly name: string,
    public readonly chatModel: StableChatModelConfig,
    public readonly tools: ReadonlyArray<ToolConfig>,
    public readonly id?: string,
  ) {}
}

@node({ packageName: "@codemation/test" })
class StableResolvableNode implements Node<StableResolvableNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(private readonly nodeResolver: NodeResolver) {}

  async execute(itemsIn: Items, ctx: NodeExecutionContext<StableResolvableNodeConfig>): Promise<NodeOutputs> {
    const chatModelFactory = this.nodeResolver.resolve(ctx.config.chatModel.type) as StableChatModelFactory;
    const resolvedToolNames = ctx.config.tools.map((toolConfig) => {
      assert.ok(this.nodeResolver.resolve(toolConfig.type));
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
          [
            new StableToolConfig("lookup_tool", "Lookup tool"),
            AgentToolFactory.asTool(new StableToolNodeConfig("Echo node"), {
              name: "node_lookup_tool",
              description: "Lookup via node-backed tool",
              inputSchema: {
                parse(input: unknown): unknown {
                  return input;
                },
              } as Tool<StableToolConfig>["inputSchema"],
              outputSchema: {
                parse(input: unknown): unknown {
                  return input;
                },
              } as Tool<StableToolConfig>["outputSchema"],
            }),
          ],
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
    [StableResolvableNode, new StableResolvableNode(container)],
    [StableChatModelFactory, new StableChatModelFactory()],
    [StableTool, new StableTool()],
    [StableToolNode, new StableToolNode()],
  ]);
  const kit = createEngineTestKit({ container, providers });

  await kit.start([workflow]);

  const compiledNode = workflow.nodes[0];
  assert.ok(compiledNode);
  assert.ok(container.resolve(compiledNode.type) instanceof StableResolvableNode);

  const config = compiledNode.config as StableResolvableNodeConfig;
  assert.ok(container.resolve(config.chatModel.type) instanceof StableChatModelFactory);
  assert.ok(container.resolve(config.tools[0]!.type) instanceof StableTool);

  const result = await kit.runToCompletion({
    wf: workflow,
    startAt: compiledNode.id,
    items: items([{ hello: "world" }]),
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.outputs.map((item) => item.json),
    [
      {
        hello: "world",
        resolvedChatModel: "Stable chat model",
        resolvedTools: ["lookup_tool", "node_lookup_tool"],
      },
    ],
  );
});

test("builder snapshot roundtrip preserves persisted workflow identity without drift", () => {
  const workflow = StableWorkflowFixtureFactory.createWorkflow();
  const tokenRegistry = new PersistedWorkflowTokenRegistry();
  tokenRegistry.registerFromWorkflows([workflow]);
  const snapshotFactory = new PersistedWorkflowSnapshotFactory(tokenRegistry);
  const originalSnapshot = snapshotFactory.create(workflow);
  const registry = new InMemoryLiveWorkflowRepository();

  registry.setWorkflows([workflow]);

  const resolvedWorkflow = new WorkflowSnapshotResolver(
    registry,
    tokenRegistry,
    new WorkflowSnapshotCodec(tokenRegistry),
    new MissingRuntimeFallbacks(),
  ).resolve({
    workflowId: workflow.id,
    workflowSnapshot: originalSnapshot,
  });
  assert.ok(resolvedWorkflow);

  const roundTrippedSnapshot = snapshotFactory.create(resolvedWorkflow);
  assert.deepEqual(roundTrippedSnapshot, originalSnapshot);

  const nodeSnapshot = originalSnapshot.nodes[0];
  assert.ok(nodeSnapshot);
  assert.equal(nodeSnapshot.nodeTokenId, "@codemation/test::StableResolvableNode");
  assert.equal(nodeSnapshot.configTokenId, "@codemation/test::StableResolvableNode");
  const configRecord = SnapshotConfigReader.asRecord(nodeSnapshot.config);
  const chatModelRecord = SnapshotConfigReader.asRecord(configRecord.chatModel);
  const toolRecord = SnapshotConfigReader.asRecord((configRecord.tools as ReadonlyArray<unknown> | undefined)?.[0]);
  const nodeBackedToolRecord = SnapshotConfigReader.asRecord(
    (configRecord.tools as ReadonlyArray<unknown> | undefined)?.[1],
  );
  const nestedNodeRecord = SnapshotConfigReader.asRecord(nodeBackedToolRecord.node);
  assert.equal(chatModelRecord.tokenId, "@codemation/test::StableChatModelFactory");
  assert.equal(toolRecord.tokenId, "@codemation/test::StableTool");
  assert.equal(nodeBackedToolRecord.tokenId, "@codemation/test::StableToolNode");
  assert.equal(nestedNodeRecord.tokenId, "@codemation/test::StableToolNode");
});
