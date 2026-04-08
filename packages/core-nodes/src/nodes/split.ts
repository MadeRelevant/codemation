import type { Item, NodeExecutionContext, RunnableNodeConfig, TypeToken } from "@codemation/core";

import { SplitNode } from "./SplitNode";

export class Split<TIn = unknown, TElem = unknown> implements RunnableNodeConfig<TIn, TElem> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SplitNode;
  readonly execution = { hint: "local" } as const;
  /**
   * When splitting yields zero items for a batch, downstream single-input nodes still run once with an empty batch.
   * Mirrors {@link MapData}'s empty-output behavior.
   */
  readonly continueWhenEmptyOutput = true as const;
  readonly icon = "lucide:ungroup" as const;

  constructor(
    public readonly name: string,
    public readonly getElements: (item: Item<TIn>, ctx: NodeExecutionContext<Split<TIn, TElem>>) => readonly TElem[],
    public readonly id?: string,
  ) {}
}

export { SplitNode } from "./SplitNode";
