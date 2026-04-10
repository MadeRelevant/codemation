import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";
import { z } from "zod";

import { MapData } from "./mapData";

@node({ packageName: "@codemation/core-nodes" })
export class MapDataNode implements RunnableNode<MapData<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;
  readonly inputSchema = z.unknown();

  async execute(args: RunnableNodeExecuteArgs<MapData<any, any>>): Promise<unknown> {
    return args.ctx.config.map(args.item, args.ctx);
  }
}
