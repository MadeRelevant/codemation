import type {
  Items,
  NodeExecutionContext,
  NodeErrorHandlerSpec,
  PortsEmission,
  RetryPolicySpec,
  RunnableNodeConfig,
  TypeToken,
} from "@codemation/core";

import { CallbackNode } from "./CallbackNode";

export type CallbackHandler<
  TInputJson = unknown,
  TOutputJson = TInputJson,
  TConfig extends Callback<TInputJson, TOutputJson> = Callback<TInputJson, TOutputJson>,
> = (
  items: Items<TInputJson>,
  ctx: NodeExecutionContext<TConfig>,
) => Promise<Items<TOutputJson> | PortsEmission | void> | Items<TOutputJson> | PortsEmission | void;

export type CallbackOptions = Readonly<{
  id?: string;
  retryPolicy?: RetryPolicySpec;
  nodeErrorHandler?: NodeErrorHandlerSpec;
  declaredOutputPorts?: ReadonlyArray<string>;
}>;

export class Callback<TInputJson = unknown, TOutputJson = TInputJson> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = CallbackNode;
  readonly execution = { hint: "local" } as const;
  readonly icon = "lucide:braces" as const;
  readonly emptyBatchExecution = "runOnce" as const;
  readonly id?: string;
  readonly retryPolicy?: RetryPolicySpec;
  readonly nodeErrorHandler?: NodeErrorHandlerSpec;
  readonly declaredOutputPorts?: ReadonlyArray<string>;

  constructor(
    public readonly name: string = "Callback",
    public readonly callback: CallbackHandler<TInputJson, TOutputJson> = Callback.defaultCallback as CallbackHandler<
      TInputJson,
      TOutputJson
    >,
    idOrOptions?: string | CallbackOptions,
    options?: CallbackOptions,
  ) {
    const resolvedOptions = typeof idOrOptions === "string" ? { ...options, id: idOrOptions } : idOrOptions;
    this.id = resolvedOptions?.id;
    this.retryPolicy = resolvedOptions?.retryPolicy;
    this.nodeErrorHandler = resolvedOptions?.nodeErrorHandler;
    this.declaredOutputPorts = resolvedOptions?.declaredOutputPorts;
  }

  private static defaultCallback<TItemJson>(items: Items<TItemJson>): Items<TItemJson> {
    return items;
  }
}

export { CallbackNode } from "./CallbackNode";
export { CallbackResultNormalizer } from "./CallbackResultNormalizerFactory";
