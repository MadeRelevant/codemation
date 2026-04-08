import type { Item, ItemNode, Items, NodeExecutionContext } from "@codemation/core";

import { node } from "@codemation/core";
import { z } from "zod";

import { MapData } from "./mapData";

@node({ packageName: "@codemation/core-nodes" })
export class MapDataNode implements ItemNode<MapData<any, any>, unknown, unknown> {
  kind = "node" as const;
  outputPorts = ["main"] as const;
  readonly inputSchema = z.unknown();

  async executeOne(args: {
    input: unknown;
    item: Item;
    itemIndex: number;
    items: Items;
    ctx: NodeExecutionContext<MapData<any, any>>;
  }): Promise<unknown> {
    return args.ctx.config.map(args.item, args.ctx);
  }
}
