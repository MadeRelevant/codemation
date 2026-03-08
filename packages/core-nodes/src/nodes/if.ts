import type { Item, Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken } from "@codemation/core";

export class If implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = IfNode;
  constructor(
    public readonly name: string,
    public readonly predicate: (item: Item, index: number, items: Items, ctx: NodeExecutionContext<If>) => boolean,
    public readonly id?: string,
  ) {}
}

export class IfNode implements Node<If> {
  kind = "node" as const;
  outputPorts = ["true", "false"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<If>): Promise<NodeOutputs> {
    const t: Item[] = [];
    const f: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const ok = ctx.config.predicate(item, i, items, ctx);
      (ok ? t : f).push(item);
    }
    return { true: t, false: f };
  }
}

