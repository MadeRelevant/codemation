import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";

import type { Filter } from "./filter";

@node({ packageName: "@codemation/core-nodes" })
export class FilterNode implements RunnableNode<Filter<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<Filter<any>>): unknown {
    if (args.ctx.config.predicate(args.item as Item, args.itemIndex, args.items, args.ctx)) {
      return args.item;
    }
    return [];
  }
}
