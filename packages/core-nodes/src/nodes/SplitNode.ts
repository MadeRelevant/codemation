import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";

import type { Split } from "./split";

@node({ packageName: "@codemation/core-nodes" })
export class SplitNode implements RunnableNode<Split<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<Split<any, any>>): unknown {
    const elements = args.ctx.config.getElements(args.item as Item, args.ctx);
    return elements;
  }
}
