import type {
  Items,
  NodeExecutionContext,
  NodeInspectorSummaryRow,
  RunnableNodeConfig,
  TypeToken,
} from "@codemation/core";
import { AggregateNode } from "./AggregateNode";

export class Aggregate<TIn = unknown, TOut = unknown> implements RunnableNodeConfig<TIn, TOut> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = AggregateNode;
  readonly execution = { hint: "local" } as const;
  readonly keepBinaries = true as const;
  readonly icon = "builtin:aggregate-rows" as const;

  constructor(
    public readonly name: string,
    public readonly aggregate: (
      items: Items<TIn>,
      ctx: NodeExecutionContext<Aggregate<TIn, TOut>>,
    ) => TOut | Promise<TOut>,
    public readonly id?: string,
  ) {}

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> | undefined {
    const fnName = this.aggregate.name;
    if (!fnName) return undefined;
    return [{ label: "Aggregator", value: fnName }];
  }
}

export { AggregateNode } from "./AggregateNode";
