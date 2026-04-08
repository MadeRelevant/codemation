import type { ZodType } from "zod";

import type { TypeToken } from "../di";
import type { Item, ItemInputMapper, Items, NodeExecutionContext, RunnableNodeConfig } from "../types";

import { ItemHarnessNode } from "./ItemHarnessNode";

/**
 * Item-mode harness node config for engine tests: engine applies {@link RunnableNodeConfig.inputSchema} +
 * optional {@link RunnableNodeConfig.mapInput}, then {@link ItemHarnessNode.executeOne} per item.
 */
export class ItemHarnessNodeConfig<TIn = unknown, TOut = unknown, TWire = TIn> implements RunnableNodeConfig<
  TIn,
  TOut,
  TWire
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ItemHarnessNode;

  constructor(
    public readonly name: string,
    public readonly inputSchema: ZodType<TIn>,
    public readonly runOne: (args: {
      input: TIn;
      item: Item<TWire>;
      itemIndex: number;
      items: Items<TWire>;
      ctx: NodeExecutionContext<ItemHarnessNodeConfig<TIn, TOut, TWire>>;
    }) => TOut | Promise<TOut>,
    public readonly opts: Readonly<{
      id?: string;
      mapInput?: ItemInputMapper<TWire, TIn>;
    }> = {},
  ) {}

  get mapInput(): ItemInputMapper<TWire, TIn> | undefined {
    return this.opts.mapInput;
  }

  get id(): string | undefined {
    return this.opts.id;
  }
}
