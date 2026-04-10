import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";

import { ExampleUppercase } from "./uppercase";

@node({ packageName: "@codemation/node-example" })
export class ExampleUppercaseNode implements RunnableNode<ExampleUppercase<Record<string, unknown>, string>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<ExampleUppercase<Record<string, unknown>, string>>): unknown {
    const item = args.item as Item;
    const json = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
    const value = String(json[args.ctx.config.cfg.field] ?? "");
    return { ...item, json: { ...json, [args.ctx.config.cfg.field]: value.toUpperCase() } };
  }
}
