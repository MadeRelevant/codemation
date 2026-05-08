import type {
  Item,
  Items,
  NodeExecutionContext,
  NodeInspectorSummaryRow,
  RunnableNodeConfig,
  TypeToken,
} from "@codemation/core";

import { FilterNode } from "./FilterNode";

export class Filter<TIn = unknown> implements RunnableNodeConfig<TIn, TIn> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = FilterNode;
  readonly execution = { hint: "local" } as const;
  readonly icon = "lucide:filter" as const;

  constructor(
    public readonly name: string,
    public readonly predicate: (
      item: Item<TIn>,
      index: number,
      items: Items<TIn>,
      ctx: NodeExecutionContext<Filter<TIn>>,
    ) => boolean,
    public readonly id?: string,
  ) {}

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> | undefined {
    const fnName = this.predicate.name;
    if (!fnName) return undefined;
    return [{ label: "Predicate", value: fnName }];
  }
}

export { FilterNode } from "./FilterNode";
