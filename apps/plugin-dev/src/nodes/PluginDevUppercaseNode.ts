import type { Item, Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";
import { node } from "@codemation/core";

import { PluginDevUppercase } from "./PluginDevUppercase";

@node({ packageName: "@codemation/plugin-dev" })
export class PluginDevUppercaseNode<
  TInputJson extends Record<string, unknown> = Record<string, unknown>,
  TField extends keyof TInputJson & string = keyof TInputJson & string,
> implements Node<PluginDevUppercase<TInputJson, TField>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<PluginDevUppercase<TInputJson, TField>>): Promise<NodeOutputs> {
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
