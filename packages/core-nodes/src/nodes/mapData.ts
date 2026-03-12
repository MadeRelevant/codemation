import type { Item, Items, Node, NodeExecutionContext, NodeOutputs, RunnableNodeConfig, TypeToken } from "@codemation/core";

export class MapData<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = MapDataNode;
  readonly tokenId = "codemation.core-nodes.map-data";
  readonly execution = { hint: "local" } as const;
  constructor(
    public readonly name: string,
    public readonly map: (item: Item<TInputJson>, ctx: NodeExecutionContext<MapData<TInputJson, TOutputJson>>) => TOutputJson,
    public readonly id?: string,
  ) {}
}

export class MapDataNode implements Node<MapData<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<MapData<any, any>>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Item<unknown>;
      out.push({ ...item, json: ctx.config.map(item, ctx) });
    }
    return { main: out };
  }
}

