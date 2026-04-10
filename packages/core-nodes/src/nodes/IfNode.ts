import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { emitPorts, node } from "@codemation/core";

import { If } from "./if";
import { tagItemForRouterFanIn } from "./mergeExecutionUtils.types";

@node({ packageName: "@codemation/core-nodes" })
export class IfNode implements RunnableNode<If<any>> {
  kind = "node" as const;

  execute(args: RunnableNodeExecuteArgs<If<any>>): unknown {
    const tagged = tagItemForRouterFanIn({
      item: args.item,
      itemIndex: args.itemIndex,
      nodeId: args.ctx.nodeId,
    });
    const ok = args.ctx.config.predicate(args.item, args.itemIndex, args.items, args.ctx);
    return emitPorts({
      true: ok ? [tagged] : [],
      false: ok ? [] : [tagged],
    });
  }
}
