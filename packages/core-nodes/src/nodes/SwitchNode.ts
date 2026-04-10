import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { emitPorts, node } from "@codemation/core";

import type { Switch } from "./switch";
import { tagItemForRouterFanIn } from "./mergeExecutionUtils.types";

/**
 * Routes each item to exactly one output port. Port names must match workflow edges (see {@link Switch} config).
 */
@node({ packageName: "@codemation/core-nodes" })
export class SwitchNode implements RunnableNode<Switch<any>> {
  kind = "node" as const;

  async execute(args: RunnableNodeExecuteArgs<Switch<any>>): Promise<unknown> {
    const tagged = tagItemForRouterFanIn({
      item: args.item,
      itemIndex: args.itemIndex,
      nodeId: args.ctx.nodeId,
    });
    const key = await Promise.resolve(
      args.ctx.config.cfg.resolveCaseKey(args.item, args.itemIndex, args.items, args.ctx),
    );
    const { cases, defaultCase } = args.ctx.config.cfg;
    const port = cases.includes(key) ? key : defaultCase;
    return emitPorts({
      [port]: [tagged],
    });
  }
}
