/* eslint-disable codemation/single-class-per-file -- Node error handler + Callback subclass are paired for this demo workflow. */
import type {
  Item,
  NodeConfigBase,
  NodeErrorHandler,
  NodeErrorHandlerArgs,
  NodeOutputs,
  WorkflowDefinition,
} from "@codemation/core";
import { NoRetryPolicy } from "@codemation/core";
import {
  Aggregate,
  Callback,
  Filter,
  If,
  ManualTrigger,
  MapData,
  Merge,
  NoOp,
  Split,
  Switch,
} from "@codemation/core-nodes";

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

/**
 * Batch-only callback that intentionally throws once, then recovers via {@link NodeErrorHandler} to:
 * - keep "ok" items on `main`
 * - route "failed" items to `error`
 *
 * This exercises engine recovery + multi-port routing so you can verify:
 * - node statuses per step
 * - item counts and contents per node/port
 */
class ContinueOnErrorRoutingCallback<TItemJson extends Record<string, unknown>> extends Callback<TItemJson, TItemJson> {
  readonly retryPolicy = new NoRetryPolicy();
  readonly nodeErrorHandler: NodeErrorHandler = new ContinueOnErrorRoutingNodeErrorHandler();

  constructor(name: string, id: string) {
    super(
      name,
      async () => {
        throw new Error("Intentional error (continue on error demo)");
      },
      id,
    );
  }
}

const trigger = new ManualTrigger<SensorBatchJson>(
  "Manual trigger",
  [
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
  ],
  "trigger",
);

const split = new Split<SensorBatchJson, ReadingRow>("Split rows", (item) => [...item.json.rows], "split");
const filter = new Filter<ReadingRow>("Filter c >= 10", (item) => item.json.c >= 10, "filter");

const recoverableError = new ContinueOnErrorRoutingCallback<ReadingRow & Record<string, unknown>>(
  "Intentional error (recover + route)",
  "recover",
);

const ifParity = new If<ReadingRow>("If even?", (item) => item.json.c % 2 === 0, "if_parity");
const tagEven = new MapData<ReadingRow, ParityRow>(
  "Tag parity=even",
  (item) => ({ ...item.json, parity: "even" }),
  "tag_even",
);
const tagOdd = new MapData<ReadingRow, ParityRow>(
  "Tag parity=odd",
  (item) => ({ ...item.json, parity: "odd" }),
  "tag_odd",
);

const merge = new Merge<ParityRow>(
  "Merge parity branches (append)",
  { mode: "append", prefer: ["true", "false"] },
  "merge",
);

const switchParity = new Switch<ParityRow>(
  "Switch parity",
  {
    cases: ["even"],
    defaultCase: "odd",
    resolveCaseKey: (item) => String((item.json as Partial<ParityRow>).parity ?? ""),
  },
  "switch",
);

const aggEven = new Aggregate<ParityRow, ParityAggregateJson>(
  "Aggregate even",
  (items) => {
    const values = items.map((i) => i.json.c);
    return { parity: "even", count: values.length, sum: values.reduce((a, v) => a + v, 0), values };
  },
  "agg_even",
);

const aggOdd = new Aggregate<ParityRow, ParityAggregateJson>(
  "Aggregate odd",
  (items) => {
    const values = items.map((i) => i.json.c);
    return { parity: "odd", count: values.length, sum: values.reduce((a, v) => a + v, 0), values };
  },
  "agg_odd",
);

const errorSink = new NoOp("NoOp (error sink)", "noop_error");
const evenSink = new NoOp("NoOp (even sink)", "noop_even");
const oddSink = new NoOp("NoOp (odd sink)", "noop_odd");

const nodes: WorkflowDefinition["nodes"] = [
  { id: "trigger", kind: trigger.kind, type: trigger.type, name: trigger.name, config: trigger },
  { id: "split", kind: split.kind, type: split.type, name: split.name, config: split },
  { id: "filter", kind: filter.kind, type: filter.type, name: filter.name, config: filter },
  {
    id: "recover",
    kind: recoverableError.kind,
    type: recoverableError.type,
    name: recoverableError.name,
    config: recoverableError,
  },
  { id: "noop_error", kind: errorSink.kind, type: errorSink.type, name: errorSink.name, config: errorSink },
  { id: "if_parity", kind: ifParity.kind, type: ifParity.type, name: ifParity.name, config: ifParity },
  { id: "tag_even", kind: tagEven.kind, type: tagEven.type, name: tagEven.name, config: tagEven },
  { id: "tag_odd", kind: tagOdd.kind, type: tagOdd.type, name: tagOdd.name, config: tagOdd },
  { id: "merge", kind: merge.kind, type: merge.type, name: merge.name, config: merge },
  { id: "switch", kind: switchParity.kind, type: switchParity.type, name: switchParity.name, config: switchParity },
  { id: "agg_even", kind: aggEven.kind, type: aggEven.type, name: aggEven.name, config: aggEven },
  { id: "agg_odd", kind: aggOdd.kind, type: aggOdd.type, name: aggOdd.name, config: aggOdd },
  { id: "noop_even", kind: evenSink.kind, type: evenSink.type, name: evenSink.name, config: evenSink },
  { id: "noop_odd", kind: oddSink.kind, type: oddSink.type, name: oddSink.name, config: oddSink },
];

const edges: WorkflowDefinition["edges"] = [
  { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "split", input: "in" } },
  { from: { nodeId: "split", output: "main" }, to: { nodeId: "filter", input: "in" } },
  { from: { nodeId: "filter", output: "main" }, to: { nodeId: "recover", input: "in" } },

  { from: { nodeId: "recover", output: "error" }, to: { nodeId: "noop_error", input: "in" } },
  { from: { nodeId: "recover", output: "main" }, to: { nodeId: "if_parity", input: "in" } },

  { from: { nodeId: "if_parity", output: "true" }, to: { nodeId: "tag_even", input: "in" } },
  { from: { nodeId: "if_parity", output: "false" }, to: { nodeId: "tag_odd", input: "in" } },

  { from: { nodeId: "tag_even", output: "main" }, to: { nodeId: "merge", input: "true" } },
  { from: { nodeId: "tag_odd", output: "main" }, to: { nodeId: "merge", input: "false" } },

  { from: { nodeId: "merge", output: "main" }, to: { nodeId: "switch", input: "in" } },

  { from: { nodeId: "switch", output: "even" }, to: { nodeId: "agg_even", input: "in" } },
  { from: { nodeId: "switch", output: "odd" }, to: { nodeId: "agg_odd", input: "in" } },

  { from: { nodeId: "agg_even", output: "main" }, to: { nodeId: "noop_even", input: "in" } },
  { from: { nodeId: "agg_odd", output: "main" }, to: { nodeId: "noop_odd", input: "in" } },
];

const wf: WorkflowDefinition = {
  id: "wf.samples.if-switch-split-filter-aggregate-error",
  name: "If + switch + split/filter/aggregate + continue-on-error demo",
  nodes,
  edges,
  discoveryPathSegments: ["samples"],
};

export default wf;
