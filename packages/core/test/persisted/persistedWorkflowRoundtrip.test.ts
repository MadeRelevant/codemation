import assert from "node:assert/strict";
import { test } from "vitest";
import "reflect-metadata";
import { z } from "zod";

import { container as tsyringeContainer } from "tsyringe";
import type {
  ChatLanguageModel,
  ChatModelConfig,
  ChatModelFactory,
  NodeResolver,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  Tool,
  ToolConfig,
  ToolExecuteArgs,
  TypeToken,
} from "../../src/index.ts";
import { PersistedWorkflowTokenRegistry } from "../../src/bootstrap/index.ts";
import type { CallableToolConfig } from "../../src/index.ts";
import {
  AgentToolFactory,
  CallableToolKindToken,
  WorkflowBuilder,
  callableTool,
  chatModel,
  node,
  tool,
} from "../../src/index.ts";
import { InMemoryLiveWorkflowRepository, PersistedWorkflowSnapshotFactory } from "../../src/testing.ts";
import { MissingRuntimeFallbacks } from "../../src/workflowSnapshots/MissingRuntimeFallbacksFactory";
import { WorkflowSnapshotCodec } from "../../src/workflowSnapshots/WorkflowSnapshotCodec";
import { WorkflowSnapshotResolver } from "../../src/workflowSnapshots/WorkflowSnapshotResolver";
import { isItemExpr, itemExpr } from "../../src/contracts/itemExpr";
import type { NodeConfigBase } from "../../src/types";
import { createEngineTestKit, items } from "../harness/index.ts";

class StableChatModelConfig implements ChatModelConfig {
  readonly type: TypeToken<unknown> = StableChatModelFactory;

  constructor(public readonly name: string) {}
}

@chatModel({ packageName: "@codemation/test" })
class StableChatModelFactory implements ChatModelFactory<StableChatModelConfig> {
  create(): ChatLanguageModel {
    return {
      languageModel: {},
      modelName: "stable-test-model",
      provider: "stable-test",
    };
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
class StableToolNode implements RunnableNode<StableToolNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<StableToolNodeConfig>): unknown {
    return {
      json: {
        echoed: (args.item.json as Record<string, unknown>).query ?? "missing",
        fromNode: true,
      },
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
class StableResolvableNode implements RunnableNode<StableResolvableNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(private readonly nodeResolver: NodeResolver) {}

  execute(args: RunnableNodeExecuteArgs<StableResolvableNodeConfig>): unknown {
    const chatModelFactory = this.nodeResolver.resolve(args.ctx.config.chatModel.type) as StableChatModelFactory;
    const resolvedToolNames = args.ctx.config.tools.map((toolConfig) => {
      assert.ok(this.nodeResolver.resolve(toolConfig.type));
      return toolConfig.name;
    });

    assert.ok(chatModelFactory instanceof StableChatModelFactory);
    return {
      ...args.item,
      json: {
        ...(args.item.json as Record<string, unknown>),
        resolvedChatModel: args.ctx.config.chatModel.name,
        resolvedTools: resolvedToolNames,
      },
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
            callableTool({
              name: "callable_smoke",
              inputSchema: z.object({ ping: z.string() }),
              outputSchema: z.object({ pong: z.string() }),
              execute: async ({ input }) => ({ pong: input.ping }),
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
    [CallableToolKindToken, {}],
  ]);
  const kit = createEngineTestKit({ container, providers });

  await kit.start([workflow]);

  const compiledNode = workflow.nodes[0];
  assert.ok(compiledNode);
  assert.ok(container.resolve(compiledNode.type) instanceof StableResolvableNode);

  const config = compiledNode.config as StableResolvableNodeConfig;
  assert.ok(container.resolve(config.chatModel.type) instanceof StableChatModelFactory);
  assert.ok(container.resolve(config.tools[0]!.type) instanceof StableTool);
  assert.ok(container.resolve(config.tools[2]!.type) === container.resolve(CallableToolKindToken));

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
        resolvedTools: ["lookup_tool", "node_lookup_tool", "callable_smoke"],
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
  const callableToolRecord = SnapshotConfigReader.asRecord(
    (configRecord.tools as ReadonlyArray<unknown> | undefined)?.[2],
  );
  assert.equal(chatModelRecord.tokenId, "@codemation/test::StableChatModelFactory");
  assert.equal(toolRecord.tokenId, "@codemation/test::StableTool");
  assert.equal(nodeBackedToolRecord.tokenId, "@codemation/test::StableToolNode");
  assert.equal(nestedNodeRecord.tokenId, "@codemation/test::StableToolNode");
  assert.equal(callableToolRecord.toolKind, "callable");
  assert.equal(callableToolRecord.tokenId, "CallableToolKindToken");
});

test("hydrated workflow callable tool still runs executeTool after snapshot round-trip", async () => {
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

  const hydratedConfig = resolvedWorkflow.nodes[0]?.config as StableResolvableNodeConfig;
  const hydratedCallable = hydratedConfig.tools[2] as CallableToolConfig;
  assert.ok(typeof hydratedCallable.executeTool === "function");

  const executed = await hydratedCallable.executeTool({
    config: hydratedCallable,
    input: { ping: "roundtrip" },
    item: { json: {} },
    itemIndex: 0,
    items: [{ json: {} }],
    ctx: {} as never,
  });
  assert.deepEqual(executed, { pong: "roundtrip" });

  const container = tsyringeContainer.createChildContainer();
  const providers = new Map<TypeToken<unknown>, unknown>([
    [StableResolvableNode, new StableResolvableNode(container)],
    [StableChatModelFactory, new StableChatModelFactory()],
    [StableTool, new StableTool()],
    [StableToolNode, new StableToolNode()],
    [CallableToolKindToken, {}],
  ]);
  const kit = createEngineTestKit({ container, providers });

  await kit.start([resolvedWorkflow]);

  const compiledNode = resolvedWorkflow.nodes[0];
  assert.ok(compiledNode);
  const result = await kit.runToCompletion({
    wf: resolvedWorkflow,
    startAt: compiledNode.id,
    items: items([{ hello: "hydrated" }]),
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.outputs.map((item) => item.json),
    [
      {
        hello: "hydrated",
        resolvedChatModel: "Stable chat model",
        resolvedTools: ["lookup_tool", "node_lookup_tool", "callable_smoke"],
      },
    ],
  );
});

class ItemValueBrandFixtureNode {}

class ItemValueBrandFixtureConfig implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly type = ItemValueBrandFixtureConfig;

  constructor(
    public readonly name: string,
    public readonly messages: unknown,
  ) {}
}

test("workflow snapshot hydration preserves itemExpr symbol brands", () => {
  const workflow = {
    id: "wf.itemExpr.brand.fixture",
    name: "ItemExpr brand fixture",
    nodes: [
      {
        id: "n1",
        kind: "node" as const,
        type: ItemValueBrandFixtureNode,
        config: new ItemValueBrandFixtureConfig(
          "n1-config",
          itemExpr(() => [{ role: "user", content: "hello" }]),
        ),
      },
    ],
    edges: [],
  };
  const tokenRegistry = new PersistedWorkflowTokenRegistry();
  tokenRegistry.registerFromWorkflows([workflow]);
  const snapshot = new WorkflowSnapshotCodec(tokenRegistry).create(workflow);
  const registry = new InMemoryLiveWorkflowRepository();
  registry.setWorkflows([workflow]);

  const resolved = new WorkflowSnapshotResolver(
    registry,
    tokenRegistry,
    new WorkflowSnapshotCodec(tokenRegistry),
    new MissingRuntimeFallbacks(),
  ).resolve({ workflowId: workflow.id, workflowSnapshot: snapshot });
  assert.ok(resolved);

  const node = resolved.nodes[0];
  assert.ok(node);
  const hydratedConfig = node.config as unknown as { messages?: unknown };
  assert.equal(isItemExpr(hydratedConfig.messages), true);
});
