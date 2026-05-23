import type {
  Item,
  NodeExecutionContext,
  NodeInspectorSummaryRow,
  RunnableNodeConfig,
  TypeToken,
} from "@codemation/core";
import { SplitNode } from "./SplitNode";

export class Split<TIn = unknown, TElem = unknown> implements RunnableNodeConfig<TIn, TElem> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SplitNode;
  readonly execution = { hint: "local" } as const;
  readonly keepBinaries = true as const;
  /**
   * When splitting yields zero items for a batch, downstream single-input nodes still run once with an empty batch.
   * Mirrors {@link MapData}'s empty-output behavior.
   */
  readonly continueWhenEmptyOutput = true as const;
  readonly icon = "builtin:split-rows" as const;

  constructor(
    public readonly name: string,
    public readonly getElements: (item: Item<TIn>, ctx: NodeExecutionContext<Split<TIn, TElem>>) => readonly TElem[],
    public readonly id?: string,
  ) {}

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> | undefined {
    const fnName = this.getElements.name;
    if (!fnName) return undefined;
    return [{ label: "Split by", value: fnName }];
  }
}

export { SplitNode } from "./SplitNode";
