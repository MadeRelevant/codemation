import type { NodeInspectorSummaryRow, RunnableNodeConfig, TypeToken } from "@codemation/core";

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

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> {
    const seconds = this.milliseconds / 1000;
    const value = seconds >= 1 ? `${seconds}s` : `${this.milliseconds}ms`;
    return [{ label: "Duration", value }];
  }
}

export { WaitDuration } from "./WaitDurationFactory";
export { WaitNode } from "./WaitNode";
