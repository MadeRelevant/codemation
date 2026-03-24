import type { Item,NodeExecutionContext,RunnableNodeConfig,TypeToken } from "@codemation/core";



import { MapDataNode } from "./MapDataNode";

export class MapData<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = MapDataNode;
  readonly execution = { hint: "local" } as const;
  /** Zero mapped items should still allow downstream nodes to run. */
  readonly continueWhenEmptyOutput = true as const;
  constructor(
    public readonly name: string,
    public readonly map: (item: Item<TInputJson>, ctx: NodeExecutionContext<MapData<TInputJson, TOutputJson>>) => TOutputJson,
    public readonly id?: string,
  ) {}
}

export { MapDataNode } from "./MapDataNode";
