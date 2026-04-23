import type { Item, NodeExecutionContext, RunnableNodeConfig, TypeToken } from "@codemation/core";

import { MapDataNode } from "./MapDataNode";

export interface MapDataOptions {
  readonly id?: string;
  readonly keepBinaries?: boolean;
}

export class MapData<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = MapDataNode;
  readonly execution = { hint: "local" } as const;
  /** Zero mapped items should still allow downstream nodes to run. */
  readonly continueWhenEmptyOutput = true as const;
  readonly icon = "lucide:square-pen" as const;
  readonly keepBinaries: boolean;

  constructor(
    public readonly name: string,
    public readonly map: (
      item: Item<TInputJson>,
      ctx: NodeExecutionContext<MapData<TInputJson, TOutputJson>>,
    ) => TOutputJson,
    private readonly options: MapDataOptions = {},
  ) {
    this.keepBinaries = options.keepBinaries ?? true;
  }

  get id(): string | undefined {
    return this.options.id;
  }
}

export { MapDataNode } from "./MapDataNode";
