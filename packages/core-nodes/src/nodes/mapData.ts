import type { Item, Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken } from "@codemation/core";

export class MapData implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = MapDataNode;
  constructor(
    public readonly name: string,
    public readonly map: (item: Item, ctx: NodeExecutionContext<MapData>) => unknown,
    public readonly id?: string,
  ) {}
}

export class MapDataNode implements Node<MapData> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<MapData>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      out.push({ ...item, json: ctx.config.map(item, ctx) });
    }
    return { main: out };
  }
}

