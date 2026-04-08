import type { Item, Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import type { Filter } from "./filter";

@node({ packageName: "@codemation/core-nodes" })
export class FilterNode implements Node<Filter<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Filter<any>>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Item;
      if (ctx.config.predicate(item as Item, i, items as Items, ctx)) {
        out.push(item);
      }
    }
    return { main: out };
  }
}
