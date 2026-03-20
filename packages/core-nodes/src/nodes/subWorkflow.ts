import type {
NodeId,
RunnableNodeConfig,
TypeToken,
UpstreamRefPlaceholder
} from "@codemation/core";



import { SubWorkflowNode } from "./SubWorkflowNode";

export class SubWorkflow<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SubWorkflowNode;
  constructor(
    public readonly name: string,
    public readonly workflowId: string,
    public upstreamRefs?: Array<{ nodeId: NodeId } | UpstreamRefPlaceholder>,
    public readonly startAt?: NodeId,
    public readonly id?: string,
  ) {}
}

export { SubWorkflowNode } from "./SubWorkflowNode";
