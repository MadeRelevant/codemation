import type { Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken } from "@codemation/core";

export type CallbackHandler<TConfig extends Callback = Callback> = (
  items: Items,
  ctx: NodeExecutionContext<TConfig>,
) => Promise<Items | void> | Items | void;

class CallbackResultNormalizer {
  static toNodeOutputs(result: Items | void, items: Items): NodeOutputs {
    return { main: result ?? items };
  }
}

export class Callback implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = CallbackNode;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string = "Callback",
    public readonly callback: CallbackHandler = Callback.defaultCallback,
    public readonly id?: string,
  ) {}

  private static defaultCallback(items: Items): Items {
    return items;
  }
}

export class CallbackNode implements Node<Callback> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Callback>): Promise<NodeOutputs> {
    const result = await ctx.config.callback(items, ctx);
    return CallbackResultNormalizer.toNodeOutputs(result, items);
  }
}
