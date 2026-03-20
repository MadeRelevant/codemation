import type { RunnableNodeConfig,TypeToken } from "@codemation/core";



import { NoOpNode } from "./NoOpNode";

export class NoOp<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = NoOpNode;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string = "NoOp",
    public readonly id?: string,
  ) {}
}

export { NoOpNode } from "./NoOpNode";
