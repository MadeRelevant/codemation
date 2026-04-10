import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { emitPorts, node } from "@codemation/core";

import { Callback } from "./CallbackNodeFactory";
import { CallbackResultNormalizer } from "./CallbackResultNormalizerFactory";

@node({ packageName: "@codemation/core-nodes" })
export class CallbackNode implements RunnableNode<Callback<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<Callback<any, any>>): Promise<unknown> {
    const items = args.items ?? [];
    const ctx = args.ctx;
    const config = ctx.config;
    if (config == null) {
      throw new Error("CallbackNode: missing ctx.config (engine should always pass runnable config)");
    }
    if (items.length === 0) {
      const result = await config.callback(items, ctx);
      return emitPorts(CallbackResultNormalizer.toNodeOutputs(result, items));
    }
    if (args.itemIndex !== items.length - 1) {
      return [];
    }
    const result = await config.callback(items, ctx);
    return emitPorts(CallbackResultNormalizer.toNodeOutputs(result, items));
  }
}
