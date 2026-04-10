import type {
  Item,
  LineageCarryPolicy,
  NodeExecutionContext,
  NodeOutputs,
  RunnableNodeExecuteArgs,
} from "@codemation/core";
import { NodeOutputNormalizer } from "../../core/src/execution/NodeOutputNormalizer.ts";
import { z } from "zod";

/**
 * Mirrors {@link NodeExecutor} per-item accumulation for direct node unit tests.
 */
export async function runPerItemLikeEngine<TConfig extends { name: string }>(
  node: {
    execute(args: RunnableNodeExecuteArgs<TConfig>): unknown | Promise<unknown>;
  },
  batchItems: Item[],
  ctx: NodeExecutionContext<TConfig>,
  carry: LineageCarryPolicy = "emitOnly",
): Promise<NodeOutputs> {
  const norm = new NodeOutputNormalizer();
  const byPort: Partial<Record<string, Item[]>> = {};
  for (let i = 0; i < batchItems.length; i++) {
    const item = batchItems[i]!;
    const parsed = z.unknown().parse(item.json);
    const raw = await Promise.resolve(
      node.execute({
        input: parsed,
        item,
        itemIndex: i,
        items: batchItems,
        ctx,
      }),
    );
    const normalized = norm.normalizeExecuteResult({ baseItem: item, raw, carry });
    for (const [port, batch] of Object.entries(normalized)) {
      if (!batch || batch.length === 0) {
        continue;
      }
      const list = byPort[port] ?? [];
      list.push(...batch);
      byPort[port] = list;
    }
  }
  return byPort as NodeOutputs;
}
