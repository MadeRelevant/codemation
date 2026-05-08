import type {
  NodeId,
  NodeInspectorSummaryRow,
  RunnableNodeConfig,
  TypeToken,
  UpstreamRefPlaceholder,
} from "@codemation/core";

import { SubWorkflowNode } from "./SubWorkflowNode";

export class SubWorkflow<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SubWorkflowNode;
  readonly icon = "lucide:workflow";
  constructor(
    public readonly name: string,
    public readonly workflowId: string,
    public upstreamRefs?: Array<{ nodeId: NodeId } | UpstreamRefPlaceholder>,
    public readonly startAt?: NodeId,
    public readonly id?: string,
  ) {}

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> {
    const rows: NodeInspectorSummaryRow[] = [{ label: "Workflow", value: this.workflowId }];
    if (this.startAt) {
      rows.push({ label: "Start at", value: this.startAt });
    }
    return rows;
  }
}

export { SubWorkflowNode } from "./SubWorkflowNode";
