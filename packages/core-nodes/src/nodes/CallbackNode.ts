import type { Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import { Callback } from "./CallbackNodeFactory";
import { CallbackResultNormalizer } from "./CallbackResultNormalizerFactory";

@node({ packageName: "@codemation/core-nodes" })
export class CallbackNode implements Node<Callback<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Callback<any, any>>): Promise<NodeOutputs> {
    const result = await ctx.config.callback(items, ctx);
    return CallbackResultNormalizer.toNodeOutputs(result, items);
  }
}
