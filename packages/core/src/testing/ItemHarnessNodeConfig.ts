import type { ZodType } from "zod";

import type { TypeToken } from "../di";
import type { Item, Items, NodeExecutionContext, RunnableNodeConfig } from "../types";

import { ItemHarnessNode } from "./ItemHarnessNode";

/**
 * Item-mode harness node config for engine tests: engine applies {@link RunnableNodeConfig.inputSchema},
 * then {@link ItemHarnessNode.execute} per item.
 */
export class ItemHarnessNodeConfig<TIn = unknown, TOut = unknown> implements RunnableNodeConfig<TIn, TOut> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ItemHarnessNode;

  constructor(
    public readonly name: string,
    public readonly inputSchema: ZodType<TIn>,
    public readonly runOne: (args: {
      input: TIn;
      item: Item<TIn>;
      itemIndex: number;
      items: Items<TIn>;
      ctx: NodeExecutionContext<ItemHarnessNodeConfig<TIn, TOut>>;
    }) => TOut | Promise<TOut>,
    public readonly opts: Readonly<{
      id?: string;
    }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }
}
