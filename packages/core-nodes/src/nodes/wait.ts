import type { RunnableNodeConfig, TypeToken } from "@codemation/core";

import { WaitNode } from "./WaitNode";

export class Wait<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = WaitNode;
  readonly execution = { hint: "local" } as const;
  /** Pass-through empty batches should still advance to downstream nodes. */
  readonly continueWhenEmptyOutput = true as const;
  readonly icon = "lucide:hourglass" as const;

  constructor(
    public readonly name: string,
    public readonly milliseconds: number,
    public readonly id?: string,
  ) {}
}

export { WaitDuration } from "./WaitDurationFactory";
export { WaitNode } from "./WaitNode";
