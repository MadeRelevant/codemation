import type { InputPortKey, NodeInspectorSummaryRow, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { MergeNode } from "./MergeNode";

export type MergeMode = "passThrough" | "append" | "mergeByPosition";

export class Merge<TInputJson = unknown, TOutputJson = TInputJson> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = MergeNode;
  readonly icon = "lucide:merge@rot=90" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{
      mode: MergeMode;
      /**
       * Deterministic input precedence order (only used for passThrough/append).
       * Any inputs not listed are appended in lexicographic order.
       */
      prefer?: ReadonlyArray<InputPortKey>;
    }> = { mode: "passThrough" },
    public readonly id?: string,
  ) {}

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> {
    const rows: NodeInspectorSummaryRow[] = [{ label: "Mode", value: this.cfg.mode }];
    if (this.cfg.prefer && this.cfg.prefer.length > 0) {
      rows.push({ label: "Input order", value: this.cfg.prefer.join(", ").slice(0, 80) });
    }
    return rows;
  }
}

export { MergeNode } from "./MergeNode";
