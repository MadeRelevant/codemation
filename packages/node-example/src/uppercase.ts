import type { Item, Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken } from "@codemation/core";

export class ExampleUppercase implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = ExampleUppercaseNode;
  constructor(
    public readonly name: string,
    public readonly cfg: { field: string },
    public readonly id?: string,
  ) {}
}

export class ExampleUppercaseNode implements Node<ExampleUppercase> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<ExampleUppercase>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const json = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
      const value = String(json[ctx.config.cfg.field] ?? "");
      out.push({ json: { ...json, [ctx.config.cfg.field]: value.toUpperCase() } });
    }
    return { main: out };
  }
}

