import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";

import type { Aggregate } from "./aggregate";

@node({ packageName: "@codemation/core-nodes" })
export class AggregateNode implements RunnableNode<Aggregate<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<Aggregate<any, any>>): Promise<unknown> {
    if (args.itemIndex !== args.items.length - 1) {
      return [];
    }
    return Promise.resolve(args.ctx.config.aggregate(args.items, args.ctx));
  }
}
