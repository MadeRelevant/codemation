import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Item,
  Items,
  NodeConfigBase,
  NodeErrorHandler,
  NodeErrorHandlerArgs,
  NodeOutputs,
  NodeExecutionContext,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
  WorkflowDefinition,
} from "../../src/index.ts";
import { NoRetryPolicy } from "../../src/index.ts";
import {
  CallbackNodeConfig,
  IfNodeConfig,
  MapNodeConfig,
  MergeNodeConfig,
  SwitchNodeConfig,
  createEngineTestKit,
  dag,
  items,
} from "../harness/index.ts";

type ReadingRow = Readonly<{
  site: string;
  c: number;
  shouldFail?: boolean;
}>;

type SensorBatchJson = Readonly<{
  rows: readonly ReadingRow[];
}>;

type ParityRow = ReadingRow & Readonly<{ parity: "even" | "odd" }>;

type ParityAggregateJson = Readonly<{
  parity: "even" | "odd";
  count: number;
  sum: number;
  values: readonly number[];
}>;

class ContinueOnErrorRoutingNodeErrorHandler implements NodeErrorHandler {
  async handle<TConfig extends NodeConfigBase>(args: NodeErrorHandlerArgs<TConfig>): Promise<NodeOutputs> {
    const ok: Item[] = [];
    const failed: Item[] = [];
    for (const item of args.items) {
      const json = item.json as ReadingRow;
      if (json?.shouldFail) {
        failed.push({
          ...item,
          json: {
            ...json,
            error: args.error.message,
          } as unknown,
        });
        continue;
      }
      ok.push(item);
    }
    return {
      main: ok,
      error: failed,
    };
  }
}

class SplitHarnessConfig<TIn = unknown, TElem = unknown> implements RunnableNodeConfig<TIn, TElem> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SplitHarnessNode;
  readonly continueWhenEmptyOutput = true as const;

  constructor(
    public readonly name: string,
    public readonly getElements: (
      item: Item<TIn>,
      ctx: NodeExecutionContext<SplitHarnessConfig<TIn, TElem>>,
    ) => readonly TElem[],
    public readonly id?: string,
  ) {}
}

class SplitHarnessNode implements RunnableNode<SplitHarnessConfig<any, any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<SplitHarnessConfig<any, any>>): unknown {
    return args.ctx.config.getElements(args.item as Item, args.ctx as never);
  }
}

class FilterHarnessConfig<TIn = unknown> implements RunnableNodeConfig<TIn, TIn> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = FilterHarnessNode;

  constructor(
    public readonly name: string,
    public readonly predicate: (
      item: Item<TIn>,
      index: number,
      items: Items<TIn>,
      ctx: NodeExecutionContext<FilterHarnessConfig<TIn>>,
    ) => boolean,
    public readonly id?: string,
  ) {}
}

class FilterHarnessNode implements RunnableNode<FilterHarnessConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<FilterHarnessConfig<any>>): unknown {
    if (args.ctx.config.predicate(args.item as Item, args.itemIndex, args.items as Items, args.ctx as never)) {
      return args.item;
    }
    return [];
  }
}

class AggregateHarnessConfig<TIn = unknown, TOut = unknown> implements RunnableNodeConfig<TIn, TOut> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = AggregateHarnessNode;

  constructor(
    public readonly name: string,
    public readonly aggregate: (
      items: Items<TIn>,
      ctx: NodeExecutionContext<AggregateHarnessConfig<TIn, TOut>>,
    ) => TOut | Promise<TOut>,
    public readonly id?: string,
  ) {}
}

class AggregateHarnessNode implements RunnableNode<AggregateHarnessConfig<any, any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<AggregateHarnessConfig<any, any>>): Promise<unknown> {
    if (args.itemIndex !== args.items.length - 1) {
      return [];
    }
    return await Promise.resolve(args.ctx.config.aggregate(args.items as Items, args.ctx as never));
  }
}

class ContinueOnErrorRoutingCallbackConfig<TItemJson extends Record<string, unknown>> implements RunnableNodeConfig<
  TItemJson,
  TItemJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ContinueOnErrorRoutingCallbackNode;
  readonly emptyBatchExecution = "runOnce" as const;
  readonly retryPolicy = new NoRetryPolicy();
  readonly nodeErrorHandler: NodeErrorHandler = new ContinueOnErrorRoutingNodeErrorHandler();

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}
}

class ContinueOnErrorRoutingCallbackNode implements RunnableNode<ContinueOnErrorRoutingCallbackConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ContinueOnErrorRoutingCallbackConfig<any>>): Promise<unknown> {
    const batch = args.items ?? [];
    if (batch.length === 0) {
      throw new Error("Intentional error (continue on error demo)");
    }
    if (args.itemIndex !== batch.length - 1) {
      return [];
    }
    throw new Error("Intentional error (continue on error demo)");
  }
}

test("engine routes error items to error port while continuing main path", async () => {
  const wfBuilder = dag({
    id: "wf.engine.kitchen-sink.branching-error-ports",
    name: "Engine kitchen sink: branching + error ports",
  });

  const split = wfBuilder.node(
    new SplitHarnessConfig<SensorBatchJson, ReadingRow>("Split rows", (item) => [...item.json.rows], "split"),
  );
  const filter = wfBuilder.node(
    new FilterHarnessConfig<ReadingRow>("Filter c >= 10", (item) => item.json.c >= 10, "filter"),
  );
  const recover = wfBuilder.node(
    new ContinueOnErrorRoutingCallbackConfig<ReadingRow & Record<string, unknown>>(
      "Recoverable failure (routes failed items)",
      "recover",
    ),
  );
  const errorSink = wfBuilder.node(new CallbackNodeConfig("Error sink (NoOp)", () => {}, { id: "noop_error" }));

  const ifParity = wfBuilder.node(
    new IfNodeConfig<ReadingRow>("If even?", (item) => item.json.c % 2 === 0, { id: "if_parity" }),
  );

  const tagEven = wfBuilder.node(
    new MapNodeConfig<ReadingRow, ParityRow>("Tag parity=even", (item) => ({ ...item.json, parity: "even" }), {
      id: "tag_even",
    }),
  );
  const tagOdd = wfBuilder.node(
    new MapNodeConfig<ReadingRow, ParityRow>("Tag parity=odd", (item) => ({ ...item.json, parity: "odd" }), {
      id: "tag_odd",
    }),
  );

  const merge = wfBuilder.node(
    new MergeNodeConfig<ParityRow>(
      "Merge parity branches (append)",
      { mode: "append", prefer: ["true", "false"] },
      { id: "merge" },
    ),
  );

  const sw = wfBuilder.node(
    new SwitchNodeConfig<ParityRow>(
      "Switch parity",
      {
        cases: ["even"],
        defaultCase: "odd",
        resolveCaseKey: (item) => String((item.json as Partial<ParityRow>).parity ?? ""),
      },
      { id: "switch" },
    ),
  );

  const aggEven = wfBuilder.node(
    new AggregateHarnessConfig<ParityRow, ParityAggregateJson>(
      "Aggregate even",
      (batch) => {
        const values = batch.map((i) => i.json.c);
        return { parity: "even", count: values.length, sum: values.reduce((a, v) => a + v, 0), values };
      },
      "agg_even",
    ),
  );
  const aggOdd = wfBuilder.node(
    new AggregateHarnessConfig<ParityRow, ParityAggregateJson>(
      "Aggregate odd",
      (batch) => {
        const values = batch.map((i) => i.json.c);
        return { parity: "odd", count: values.length, sum: values.reduce((a, v) => a + v, 0), values };
      },
      "agg_odd",
    ),
  );

  const evenSink = wfBuilder.node(new CallbackNodeConfig("Even sink (NoOp)", () => {}, { id: "noop_even" }));
  const oddSink = wfBuilder.node(new CallbackNodeConfig("Odd sink (NoOp)", () => {}, { id: "noop_odd" }));

  wfBuilder.connect(split, filter);
  wfBuilder.connect(filter, recover);
  wfBuilder.connect(recover, errorSink, "error");
  wfBuilder.connect(recover, ifParity, "main");

  wfBuilder.connect(ifParity, tagEven, "true");
  wfBuilder.connect(ifParity, tagOdd, "false");

  wfBuilder.connect(tagEven, merge, "main", "true");
  wfBuilder.connect(tagOdd, merge, "main", "false");

  wfBuilder.connect(merge, sw);
  wfBuilder.connect(sw, aggEven, "even");
  wfBuilder.connect(sw, aggOdd, "odd");
  wfBuilder.connect(aggEven, evenSink);
  wfBuilder.connect(aggOdd, oddSink);

  const wf: WorkflowDefinition = wfBuilder.build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const run = await kit.runToCompletion({
    wf,
    startAt: "split",
    items: items([
      {
        rows: [
          { site: "warehouse-7", c: 9 },
          { site: "warehouse-7", c: 12 },
          { site: "warehouse-7", c: 13 },
          { site: "warehouse-7", c: 14, shouldFail: true },
          { site: "warehouse-7", c: 15 },
          { site: "warehouse-7", c: 16 },
        ],
      },
    ]),
  });

  assert.equal(run.status, "completed");

  const stored = await kit.runStore.load(run.runId);
  assert.ok(stored);
  assert.equal(stored.status, "completed");

  const nodeIds = [
    "split",
    "filter",
    "recover",
    "noop_error",
    "if_parity",
    "tag_even",
    "tag_odd",
    "merge",
    "switch",
    "agg_even",
    "agg_odd",
    "noop_even",
    "noop_odd",
  ] as const;
  for (const nodeId of nodeIds) {
    assert.equal(stored.nodeSnapshotsByNodeId?.[nodeId]?.status, "completed", `node ${nodeId} status`);
  }

  assert.deepEqual(
    stored.outputsByNode.split?.main?.map((i) => i.json),
    [
      { site: "warehouse-7", c: 9 },
      { site: "warehouse-7", c: 12 },
      { site: "warehouse-7", c: 13 },
      { site: "warehouse-7", c: 14, shouldFail: true },
      { site: "warehouse-7", c: 15 },
      { site: "warehouse-7", c: 16 },
    ],
  );

  assert.deepEqual(
    stored.outputsByNode.filter?.main?.map((i) => i.json),
    [
      { site: "warehouse-7", c: 12 },
      { site: "warehouse-7", c: 13 },
      { site: "warehouse-7", c: 14, shouldFail: true },
      { site: "warehouse-7", c: 15 },
      { site: "warehouse-7", c: 16 },
    ],
  );

  assert.deepEqual(
    stored.outputsByNode.recover?.main?.map((i) => i.json),
    [
      { site: "warehouse-7", c: 12 },
      { site: "warehouse-7", c: 13 },
      { site: "warehouse-7", c: 15 },
      { site: "warehouse-7", c: 16 },
    ],
  );
  assert.deepEqual(
    stored.outputsByNode.recover?.error?.map((i) => i.json),
    [
      {
        site: "warehouse-7",
        c: 14,
        shouldFail: true,
        error: "Intentional error (continue on error demo)",
      },
    ],
  );

  assert.deepEqual(
    stored.outputsByNode.if_parity?.true?.map((i) => (i.json as ReadingRow).c),
    [12, 16],
  );
  assert.deepEqual(
    stored.outputsByNode.if_parity?.false?.map((i) => (i.json as ReadingRow).c),
    [13, 15],
  );

  assert.deepEqual(
    stored.outputsByNode.merge?.main?.map((i) => i.json),
    [
      { site: "warehouse-7", c: 12, parity: "even" },
      { site: "warehouse-7", c: 16, parity: "even" },
      { site: "warehouse-7", c: 13, parity: "odd" },
      { site: "warehouse-7", c: 15, parity: "odd" },
    ],
  );

  assert.deepEqual(
    stored.outputsByNode.switch?.even?.map((i) => i.json),
    [
      { site: "warehouse-7", c: 12, parity: "even" },
      { site: "warehouse-7", c: 16, parity: "even" },
    ],
  );
  assert.deepEqual(
    stored.outputsByNode.switch?.odd?.map((i) => i.json),
    [
      { site: "warehouse-7", c: 13, parity: "odd" },
      { site: "warehouse-7", c: 15, parity: "odd" },
    ],
  );

  assert.deepEqual(
    stored.outputsByNode.agg_even?.main?.map((i) => i.json),
    [{ parity: "even", count: 2, sum: 28, values: [12, 16] }],
  );
  assert.deepEqual(
    stored.outputsByNode.agg_odd?.main?.map((i) => i.json),
    [{ parity: "odd", count: 2, sum: 28, values: [13, 15] }],
  );

  assert.deepEqual(
    stored.outputsByNode.noop_error?.main?.map((i) => i.json),
    [
      {
        site: "warehouse-7",
        c: 14,
        shouldFail: true,
        error: "Intentional error (continue on error demo)",
      },
    ],
  );
  assert.deepEqual(
    stored.outputsByNode.noop_even?.main?.map((i) => i.json),
    [{ parity: "even", count: 2, sum: 28, values: [12, 16] }],
  );
  assert.deepEqual(
    stored.outputsByNode.noop_odd?.main?.map((i) => i.json),
    [{ parity: "odd", count: 2, sum: 28, values: [13, 15] }],
  );
});
