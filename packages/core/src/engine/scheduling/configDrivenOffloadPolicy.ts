import type { ExecutionMode,NodeConfigBase,NodeId,NodeOffloadPolicy,NodeSchedulerDecision,WorkflowId } from "../../types";

export class ConfigDrivenOffloadPolicy implements NodeOffloadPolicy {
  private readonly defaultMode: ExecutionMode;

  constructor(defaultMode: ExecutionMode = "worker") {
    this.defaultMode = defaultMode;
  }

  decide(args: { workflowId: WorkflowId; nodeId: NodeId; config: NodeConfigBase }): NodeSchedulerDecision {
    const hint = args.config.execution?.hint;
    const queue = args.config.execution?.queue;

    if (hint === "local") return { mode: "local" };
    if (hint === "worker") return { mode: "worker", queue };

    // If a queue is specified, treat it as an implicit worker hint.
    if (queue) return { mode: "worker", queue };

    return { mode: this.defaultMode };
  }
}

