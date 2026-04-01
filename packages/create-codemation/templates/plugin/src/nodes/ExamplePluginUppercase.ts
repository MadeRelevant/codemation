import type {
  Item,
  Items,
  Node,
  NodeExecutionContext,
  NodeOutputs,
  RunnableNodeConfig,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";

@node({ packageName: "codemation-plugin" })
export class ExamplePluginUppercaseNode<
  TInputJson extends Record<string, unknown> = Record<string, unknown>,
  TField extends keyof TInputJson & string = keyof TInputJson & string,
> implements Node<ExamplePluginUppercase<TInputJson, TField>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(
    items: Items,
    ctx: NodeExecutionContext<ExamplePluginUppercase<TInputJson, TField>>,
  ): Promise<NodeOutputs> {
    const output: Item[] = [];
    for (const item of items) {
      const itemJson =
        typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
      const value = String(itemJson[ctx.config.cfg.field] ?? "");
      output.push({
        ...item,
        json: {
          ...itemJson,
          [ctx.config.cfg.field]: value.toUpperCase(),
        },
      });
    }
    return { main: output };
  }
}

export class ExamplePluginUppercase<
  TInputJson extends Record<string, unknown> = Record<string, unknown>,
  TField extends keyof TInputJson & string = keyof TInputJson & string,
> implements RunnableNodeConfig<TInputJson, TInputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExamplePluginUppercaseNode;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{ field: TField }>,
    public readonly id?: string,
  ) {}
}
