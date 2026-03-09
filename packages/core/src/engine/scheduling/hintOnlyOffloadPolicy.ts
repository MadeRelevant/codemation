import type { NodeConfigBase, NodeOffloadPolicy, NodeSchedulerDecision, WorkflowId, NodeId } from "../../types";

export class HintOnlyOffloadPolicy implements NodeOffloadPolicy {
  decide(args: { workflowId: WorkflowId; nodeId: NodeId; config: NodeConfigBase }): NodeSchedulerDecision {
    const hint = args.config.execution?.hint;
    if (hint === "worker") return { mode: "worker", queue: args.config.execution?.queue };
    return { mode: "local" };
  }
}

