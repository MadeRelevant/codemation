import type { Item,Items,Node,NodeExecutionContext,NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import { MapData } from "./mapData";



@node({ packageName: "@codemation/core-nodes" })
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
