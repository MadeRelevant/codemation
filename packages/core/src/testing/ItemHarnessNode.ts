import type { Item, ItemNode, Items, NodeExecutionContext } from "../types";

import type { ItemHarnessNodeConfig } from "./ItemHarnessNodeConfig";

/**
 * Item-mode harness node for engine tests (see {@link ItemHarnessNodeConfig}).
 */
export class ItemHarnessNode implements ItemNode<ItemHarnessNodeConfig<any, any>, unknown, unknown> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async executeOne(args: {
    input: unknown;
    item: Item;
    itemIndex: number;
    items: Items;
    ctx: NodeExecutionContext<ItemHarnessNodeConfig<any, any>>;
  }): Promise<unknown> {
    return await args.ctx.config.runOne({
      input: args.input as never,
      item: args.item,
      itemIndex: args.itemIndex,
      items: args.items,
      ctx: args.ctx,
    });
  }
}
