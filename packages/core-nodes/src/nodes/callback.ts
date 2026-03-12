import type { Items, Node, NodeExecutionContext, NodeOutputs, RunnableNodeConfig, TypeToken } from "@codemation/core";

export type CallbackHandler<TInputJson = unknown, TOutputJson = TInputJson, TConfig extends Callback<TInputJson, TOutputJson> = Callback<TInputJson, TOutputJson>> = (
  items: Items<TInputJson>,
  ctx: NodeExecutionContext<TConfig>,
) => Promise<Items<TOutputJson> | void> | Items<TOutputJson> | void;

class CallbackResultNormalizer {
  static toNodeOutputs(result: Items | void, items: Items): NodeOutputs {
    return { main: result ?? items };
  }
}

export class Callback<TInputJson = unknown, TOutputJson = TInputJson> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = CallbackNode;
  readonly tokenId = "codemation.core-nodes.callback";
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string = "Callback",
    public readonly callback: CallbackHandler<TInputJson, TOutputJson> = Callback.defaultCallback as CallbackHandler<TInputJson, TOutputJson>,
    public readonly id?: string,
  ) {}

  private static defaultCallback<TItemJson>(items: Items<TItemJson>): Items<TItemJson> {
    return items;
  }
}

export class CallbackNode implements Node<Callback<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Callback<any, any>>): Promise<NodeOutputs> {
    const result = await ctx.config.callback(items, ctx);
    return CallbackResultNormalizer.toNodeOutputs(result, items);
  }
}
