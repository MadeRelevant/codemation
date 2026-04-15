import { resolveItemExprsForExecution } from "../contracts/itemExpr";
import type { Item, NodeExecutionContext, RunnableNodeConfig } from "../types";

/**
 * Resolves {@link import("../contracts/itemExpr").ItemExpr} leaves on runnable config before {@link RunnableNode.execute}.
 */
export class ItemExprResolver {
  async resolveConfigForItem<TConfig extends RunnableNodeConfig<any, any>>(
    ctx: NodeExecutionContext<TConfig>,
    item: Item,
    itemIndex: number,
    items: ReadonlyArray<Item>,
  ): Promise<NodeExecutionContext<TConfig>> {
    if (!ctx) {
      throw new Error("ItemExprResolver.resolveConfigForItem: ctx is required");
    }
    const resolvedConfig = await resolveItemExprsForExecution(ctx.config, ctx, item, itemIndex, items);
    const merged = resolvedConfig !== undefined && resolvedConfig !== null ? resolvedConfig : ctx.config;
    if (merged === undefined || merged === null) {
      return ctx;
    }
    return {
      ...ctx,
      config: merged as TConfig,
    };
  }
}
