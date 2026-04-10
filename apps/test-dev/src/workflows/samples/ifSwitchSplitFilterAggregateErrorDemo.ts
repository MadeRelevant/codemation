/* eslint-disable codemation/single-class-per-file -- Small helper classes keep this demo workflow readable. */
import type { Item, NodeErrorHandler, NodeConfigBase, NodeErrorHandlerArgs, NodeOutputs } from "@codemation/core";
import { NoRetryPolicy } from "@codemation/core";
import { workflow } from "@codemation/host";
import { Aggregate, Callback, NoOp, type CallbackOptions } from "@codemation/core-nodes";

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
class ContinueOnErrorRoutingCallbackFactory {
  static createOptions(): CallbackOptions {
    return {
      id: "recover",
      retryPolicy: new NoRetryPolicy(),
      nodeErrorHandler: new ContinueOnErrorRoutingNodeErrorHandler(),
    };
  }
}

class ParityAggregateFactory {
  static even(items: readonly Item<ParityRow>[]): ParityAggregateJson {
    const values = items.map((i) => i.json.c);
    return { parity: "even", count: values.length, sum: values.reduce((a, v) => a + v, 0), values };
  }

  static odd(items: readonly Item<ParityRow>[]): ParityAggregateJson {
    const values = items.map((i) => i.json.c);
    return { parity: "odd", count: values.length, sum: values.reduce((a, v) => a + v, 0), values };
  }
}

export default workflow("wf.samples.if-switch-split-filter-aggregate-error")
  .name("If + switch + split/filter/aggregate + continue-on-error demo")
  .manualTrigger<SensorBatchJson>("Manual trigger", [
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
  ])
  .split("Split rows", (item) => [...item.json.rows], "split")
  .filter("Filter c >= 10", (item) => item.json.c >= 10, "filter")
  .then(
    new Callback<ReadingRow & Record<string, unknown>>(
      "Intentional error (recover + route)",
      async () => {
        throw new Error("Intentional error (continue on error demo)");
      },
      ContinueOnErrorRoutingCallbackFactory.createOptions(),
    ),
  )
  .route({
    error: (branch) => branch.then(new NoOp("NoOp (error sink)", "noop_error")),
    main: (branch) =>
      branch
        .if<ParityRow>("If even?", (item) => (item as ReadingRow).c % 2 === 0, {
          true: (trueBranch) =>
            trueBranch.map(
              "Tag parity=even",
              (item) => ({ ...(item as ReadingRow), parity: "even" as ParityRow["parity"] }),
              "tag_even",
            ),
          false: (falseBranch) =>
            falseBranch.map(
              "Tag parity=odd",
              (item) => ({ ...(item as ReadingRow), parity: "odd" as ParityRow["parity"] }),
              "tag_odd",
            ),
        })
        .merge("Merge parity branches (append)", { mode: "append", prefer: ["true", "false"] }, "merge")
        .switch(
          "Switch parity",
          {
            cases: ["even"],
            defaultCase: "odd",
            resolveCaseKey: (item) => String((item as ParityRow).parity ?? ""),
            branches: {
              even: (evenBranch) =>
                evenBranch
                  .then(
                    new Aggregate<ParityRow, ParityAggregateJson>(
                      "Aggregate even",
                      ParityAggregateFactory.even,
                      "agg_even",
                    ),
                  )
                  .then(new NoOp("NoOp (even sink)", "noop_even")),
              odd: (oddBranch) =>
                oddBranch
                  .then(
                    new Aggregate<ParityRow, ParityAggregateJson>(
                      "Aggregate odd",
                      ParityAggregateFactory.odd,
                      "agg_odd",
                    ),
                  )
                  .then(new NoOp("NoOp (odd sink)", "noop_odd")),
            },
          },
          "switch",
        ),
  })
  .build();
