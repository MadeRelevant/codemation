import type { Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import type { Aggregate } from "./aggregate";

@node({ packageName: "@codemation/core-nodes" })
export class AggregateNode implements Node<Aggregate<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Aggregate<any, any>>): Promise<NodeOutputs> {
    if (items.length === 0) {
      return { main: [] };
    }
    const json = await Promise.resolve(ctx.config.aggregate(items as Items, ctx));
    return { main: [{ json }] };
  }
}
