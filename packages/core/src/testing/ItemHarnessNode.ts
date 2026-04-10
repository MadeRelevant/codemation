import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "../types";

import type { ItemHarnessNodeConfig } from "./ItemHarnessNodeConfig";

/**
 * Item-mode harness node for engine tests (see {@link ItemHarnessNodeConfig}).
 */
export class ItemHarnessNode implements RunnableNode<ItemHarnessNodeConfig<any, any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ItemHarnessNodeConfig<any, any>>): Promise<unknown> {
    return await args.ctx.config.runOne({
      input: args.input as never,
      item: args.item as Item,
      itemIndex: args.itemIndex,
      items: args.items,
      ctx: args.ctx,
    });
  }
}
