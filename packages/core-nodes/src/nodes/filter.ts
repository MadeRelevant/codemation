import type { Item, Items, NodeExecutionContext, RunnableNodeConfig, TypeToken } from "@codemation/core";

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
}

export { FilterNode } from "./FilterNode";
