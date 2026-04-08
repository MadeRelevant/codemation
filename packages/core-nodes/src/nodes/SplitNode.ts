import type { Item, Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import type { Split } from "./split";

@node({ packageName: "@codemation/core-nodes" })
export class SplitNode implements Node<Split<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Split<any, any>>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Item;
      const elements = ctx.config.getElements(item, ctx);
      for (let j = 0; j < elements.length; j++) {
        out.push({
          ...item,
          json: elements[j],
        });
      }
    }
    return { main: out };
  }
}
