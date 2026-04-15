import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  MultiInputNode,
  NodeActivationRequest,
  NodeExecutionContext,
  NodeResolver,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
} from "../../src/index.ts";
import {
  DefaultAsyncSleeper,
  InProcessRetryRunner,
  NodeExecutor,
  NodeInstanceFactory,
} from "../../src/bootstrap/index.ts";
import { emitPorts } from "../../src/index.ts";
import { ItemExprResolver } from "../../src/execution/ItemExprResolver.ts";
import { CallbackNode, CallbackNodeConfig } from "../harness/nodes.ts";
import { z } from "zod";

class SuccessfulNode {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(): unknown {
    return { ok: true };
  }
}

class SuccessfulMultiNode implements MultiInputNode {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async executeMulti(): Promise<import("../../src/index.ts").NodeOutputs> {
    return { main: [{ json: { multi: true } }] };
  }
}

class PortsEnvelopeMultiNode implements MultiInputNode {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async executeMulti(): Promise<import("../../src/index.ts").NodeOutputs> {
    return { ports: { main: [{ json: { multi: true } }] } } as never;
  }
}

class InvalidTriggerNode {
  readonly kind = "trigger" as const;

  async execute(): Promise<unknown> {
    return emitPorts({ main: [{ json: { trigger: true } }] });
  }
}

class RunOnceEmptyBatchCapture implements RunnableNode {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;
  readonly emptyBatchExecution = "runOnce" as const;
  itemsPassed: ReadonlyArray<unknown> | undefined;

  execute(args: RunnableNodeExecuteArgs<RunnableNodeConfig>): unknown {
    this.itemsPassed = args.items;
    return { main: [] };
  }
}

class StaticNodeResolver implements NodeResolver {
  constructor(private readonly node: unknown) {}

  resolve<T>(): T {
    return this.node as T;
  }
}

class ResolverReturnsUndefined extends ItemExprResolver {
  override async resolveConfigForItem<TConfig extends RunnableNodeConfig<any, any>>(
    ctx: NodeExecutionContext<TConfig>,
  ): Promise<NodeExecutionContext<TConfig>> {
    void ctx;
    return undefined as unknown as NodeExecutionContext<TConfig>;
  }
}

class ResolverReturnsCtxWithUndefinedConfig extends ItemExprResolver {
  override async resolveConfigForItem<TConfig extends RunnableNodeConfig<any, any>>(
    ctx: NodeExecutionContext<TConfig>,
  ): Promise<NodeExecutionContext<TConfig>> {
    return { ...ctx, config: undefined as unknown as TConfig };
  }
}

test("node executor runs single-input node activations", async () => {
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new SuccessfulNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );
  const result = await executor.execute({
    kind: "single",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    input: [{ json: { n: 1 } }],
    ctx: {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "act_1",
      config: { type: "test.node" },
      data: {} as never,
    },
  } satisfies NodeActivationRequest);

  assert.deepEqual(result, { main: [{ json: { ok: true } }] });
});

test("node executor runs multi-input node activations", async () => {
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new SuccessfulMultiNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );
  const result = await executor.execute({
    kind: "multi",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    inputsByPort: { left: [], right: [] },
    ctx: {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "act_1",
      config: { type: "test.node" },
      data: {} as never,
    },
  } satisfies NodeActivationRequest);

  assert.deepEqual(result, { main: [{ json: { multi: true } }] });
});

test("node executor runs single-input activations for multi-input-only nodes via executeMulti", async () => {
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new SuccessfulMultiNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );
  const result = await executor.execute({
    kind: "single",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    input: [{ json: { n: 1 } }],
    ctx: {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "act_1",
      config: { type: "test.node" },
      data: {} as never,
    },
  } satisfies NodeActivationRequest);

  assert.deepEqual(result, { main: [{ json: { multi: true } }] });
});

test("node executor rejects unbranded ports envelope from executeMulti", async () => {
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new PortsEnvelopeMultiNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );

  await assert.rejects(
    () =>
      executor.execute({
        kind: "multi",
        runId: "run_1",
        activationId: "act_1",
        workflowId: "wf_1",
        nodeId: "node_1",
        inputsByPort: { left: [], right: [] },
        ctx: {
          runId: "run_1",
          workflowId: "wf_1",
          nodeId: "node_1",
          activationId: "act_1",
          config: { type: "test.node" },
          data: {} as never,
        },
      } satisfies NodeActivationRequest),
    /executeMulti\(\) returned an unbranded `\{ ports: \.\.\. \}` object/i,
  );
});

test("node executor rejects emitPorts payloads from trigger execute", async () => {
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new InvalidTriggerNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );

  await assert.rejects(
    () =>
      executor.execute({
        kind: "single",
        runId: "run_1",
        activationId: "act_1",
        workflowId: "wf_1",
        nodeId: "node_1",
        input: [{ json: { n: 1 } }],
        ctx: {
          runId: "run_1",
          workflowId: "wf_1",
          nodeId: "node_1",
          activationId: "act_1",
          config: { kind: "trigger", type: "test.trigger" } as never,
          data: {} as never,
        },
      } satisfies NodeActivationRequest),
    /trigger execute\(\) must return NodeOutputs, not emitPorts/i,
  );
});

test("node executor treats undefined single input as empty batch for emptyBatchExecution runOnce", async () => {
  const capture = new RunOnceEmptyBatchCapture();
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(capture)),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );
  await executor.execute({
    kind: "single",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    input: undefined as unknown as import("../../src/index.ts").Items,
    ctx: {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "act_1",
      config: { type: "test.node", emptyBatchExecution: "runOnce" },
      data: {} as never,
    },
  } satisfies NodeActivationRequest);

  assert.ok(Array.isArray(capture.itemsPassed));
  assert.equal(capture.itemsPassed?.length, 0);
});

test("node executor passes parsed input as args.input without rewriting item.json", async () => {
  class SchemaCoercionNode implements RunnableNode {
    readonly kind = "node" as const;
    readonly outputPorts = ["main"] as const;
    readonly inputSchema = z.object({ n: z.coerce.number() }).transform(({ n }) => ({ n, doubled: n * 2 }));
    seenWire: unknown | undefined;
    seenInput: unknown | undefined;

    execute(args: RunnableNodeExecuteArgs<RunnableNodeConfig>): unknown {
      this.seenWire = args.item.json;
      this.seenInput = args.input;
      return args.input;
    }
  }

  const node = new SchemaCoercionNode();
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(node)),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );
  const result = await executor.execute({
    kind: "single",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    input: [{ json: { n: "21" } }],
    ctx: {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "act_1",
      config: { type: "test.node" },
      data: {} as never,
    },
  } satisfies NodeActivationRequest);

  assert.deepEqual(node.seenWire, { n: "21" });
  assert.deepEqual(node.seenInput, { n: 21, doubled: 42 });
  assert.deepEqual(result, { main: [{ json: { n: 21, doubled: 42 } }] });
});

test("node executor falls back to request ctx when ItemExprResolver returns undefined", async () => {
  let seenCtx: NodeExecutionContext<CallbackNodeConfig> | undefined;
  const callbackConfig = new CallbackNodeConfig(
    "Cb",
    ({ ctx }) => {
      seenCtx = ctx;
    },
    { id: "id" },
  );
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new CallbackNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
    new ResolverReturnsUndefined(),
  );
  const requestCtx: NodeExecutionContext<CallbackNodeConfig> = {
    runId: "run_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    activationId: "act_1",
    config: callbackConfig,
    data: {} as never,
  };
  await executor.execute({
    kind: "single",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    input: undefined as unknown as import("../../src/index.ts").Items,
    ctx: requestCtx,
  } satisfies NodeActivationRequest);

  assert.equal(seenCtx?.nodeId, "node_1");
  assert.equal(seenCtx?.config, callbackConfig);
});

test("node executor falls back to request ctx when ItemExprResolver returns ctx with config undefined", async () => {
  let seenCtx: NodeExecutionContext<CallbackNodeConfig> | undefined;
  const callbackConfig = new CallbackNodeConfig(
    "Cb",
    ({ ctx }) => {
      seenCtx = ctx;
    },
    { id: "id" },
  );
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new CallbackNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
    new ResolverReturnsCtxWithUndefinedConfig(),
  );
  const requestCtx: NodeExecutionContext<CallbackNodeConfig> = {
    runId: "run_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    activationId: "act_1",
    config: callbackConfig,
    data: {} as never,
  };
  await executor.execute({
    kind: "single",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    input: undefined as unknown as import("../../src/index.ts").Items,
    ctx: requestCtx,
  } satisfies NodeActivationRequest);

  assert.equal(seenCtx?.nodeId, "node_1");
  assert.equal(seenCtx?.config, callbackConfig);
});
