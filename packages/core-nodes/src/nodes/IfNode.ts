import type { Item, Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import { If } from "./if";

@node({ packageName: "@codemation/core-nodes" })
export class IfNode implements Node<If<any>> {
  kind = "node" as const;
  outputPorts = ["true", "false"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<If<any>>): Promise<NodeOutputs> {
    const t: Item[] = [];
    const f: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Item<unknown>;
      const metaBase = (
        item.meta && typeof item.meta === "object" ? (item.meta as Record<string, unknown>) : {}
      ) as Record<string, unknown>;
      const cmBase =
        metaBase._cm && typeof metaBase._cm === "object"
          ? (metaBase._cm as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const originIndex = typeof cmBase.originIndex === "number" ? (cmBase.originIndex as number) : i;
      const tagged: Item = {
        ...item,
        meta: { ...metaBase, _cm: { ...cmBase, originIndex } },
        paired: [{ nodeId: ctx.nodeId, output: "$in", itemIndex: originIndex }, ...(item.paired ?? [])],
      };
      const ok = ctx.config.predicate(item, i, items, ctx);
      (ok ? t : f).push(tagged);
    }
    return { true: t, false: f };
  }
}
