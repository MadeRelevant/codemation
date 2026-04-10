import { resolveItemValuesForExecution } from "../contracts/itemValue";
import type { Item, NodeExecutionContext, RunnableNodeConfig } from "../types";

/**
 * Resolves {@link import("../contracts/itemValue").ItemValue} leaves on runnable config before {@link RunnableNode.execute}.
 */
export class ItemValueResolver {
  async resolveConfigForItem<TConfig extends RunnableNodeConfig<any, any>>(
    ctx: NodeExecutionContext<TConfig>,
    item: Item,
    itemIndex: number,
    items: ReadonlyArray<Item>,
  ): Promise<NodeExecutionContext<TConfig>> {
    if (!ctx) {
      throw new Error("ItemValueResolver.resolveConfigForItem: ctx is required");
    }
    const resolvedConfig = await resolveItemValuesForExecution(ctx.config, ctx, item, itemIndex, items);
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
