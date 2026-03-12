import type { Item, Items, Node, NodeExecutionContext, NodeOutputs, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { node } from "@codemation/core";

export class ExampleUppercase<
  TInputJson extends Record<string, unknown> = Record<string, unknown>,
  TField extends keyof TInputJson & string = keyof TInputJson & string,
> implements RunnableNodeConfig<TInputJson, TInputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExampleUppercaseNode;
  constructor(
    public readonly name: string,
    public readonly cfg: { field: TField },
    public readonly id?: string,
  ) {}
}

@node({ packageName: "@codemation/node-example" })
export class ExampleUppercaseNode implements Node<ExampleUppercase<Record<string, unknown>, string>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<ExampleUppercase<Record<string, unknown>, string>>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const json = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
      const value = String(json[ctx.config.cfg.field] ?? "");
      out.push({ ...item, json: { ...json, [ctx.config.cfg.field]: value.toUpperCase() } });
    }
    return { main: out };
  }
}

