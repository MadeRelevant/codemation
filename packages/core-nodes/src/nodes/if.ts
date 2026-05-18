import type {
  Item,
  Items,
  NodeExecutionContext,
  NodeInspectorSummaryRow,
  RunnableNodeConfig,
  TypeToken,
} from "@codemation/core";
import { IfNode } from "./IfNode";

export class If<TInputJson = unknown> implements RunnableNodeConfig<TInputJson, TInputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = IfNode;
  readonly execution = { hint: "local" } as const;
  readonly icon = "lucide:split@rot=90" as const;
  readonly declaredOutputPorts = ["true", "false"] as const;
  constructor(
    public readonly name: string,
    public readonly predicate: (
      item: Item<TInputJson>,
      index: number,
      items: Items<TInputJson>,
      ctx: NodeExecutionContext<If<TInputJson>>,
    ) => boolean,
    public readonly id?: string,
  ) {}

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> | undefined {
    const fnName = this.predicate.name;
    if (!fnName) return undefined;
    return [{ label: "Predicate", value: fnName }];
  }
}

export { IfNode } from "./IfNode";
