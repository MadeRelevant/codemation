import type { Items, NodeExecutionContext, RunnableNodeConfig, TypeToken } from "@codemation/core";

import { CallbackNode } from "./CallbackNode";

export type CallbackHandler<
  TInputJson = unknown,
  TOutputJson = TInputJson,
  TConfig extends Callback<TInputJson, TOutputJson> = Callback<TInputJson, TOutputJson>,
> = (
  items: Items<TInputJson>,
  ctx: NodeExecutionContext<TConfig>,
) => Promise<Items<TOutputJson> | void> | Items<TOutputJson> | void;

export class Callback<TInputJson = unknown, TOutputJson = TInputJson> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = CallbackNode;
  readonly execution = { hint: "local" } as const;
  readonly icon = "lucide:braces" as const;

  constructor(
    public readonly name: string = "Callback",
    public readonly callback: CallbackHandler<TInputJson, TOutputJson> = Callback.defaultCallback as CallbackHandler<
      TInputJson,
      TOutputJson
    >,
    public readonly id?: string,
  ) {}

  private static defaultCallback<TItemJson>(items: Items<TItemJson>): Items<TItemJson> {
    return items;
  }
}

export { CallbackNode } from "./CallbackNode";
export { CallbackResultNormalizer } from "./CallbackResultNormalizerFactory";
