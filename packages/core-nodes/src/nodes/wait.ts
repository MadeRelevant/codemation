import type { RunnableNodeConfig,TypeToken } from "@codemation/core";



import { WaitNode } from "./WaitNode";

export class Wait<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = WaitNode;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string,
    public readonly milliseconds: number,
    public readonly id?: string,
  ) {}
}

export { WaitDuration } from "./WaitDurationFactory";
export { WaitNode } from "./WaitNode";
