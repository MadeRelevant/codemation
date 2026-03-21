import type { Items, NodeId, ParentExecutionRef, RunResult, WorkflowDefinition, WorkflowId, WorkflowRepository } from "../../../types";

import { Engine } from "../../api/Engine";

export class EngineWorkflowRunnerService {
  constructor(
    private readonly engine: Engine,
    private readonly workflowRepository: WorkflowRepository,
  ) {}

  async runById(args: { workflowId: WorkflowId; startAt?: NodeId; items: Items; parent?: ParentExecutionRef }): Promise<RunResult> {
    const { workflowId, startAt, items, parent } = args;
    const wf = this.workflowRepository.get(workflowId);
    if (!wf) throw new Error(`Unknown workflowId: ${workflowId}`);

    const startNodeId = startAt ?? this.findDefaultStartNodeId(wf);
    const scheduled = await this.engine.runWorkflow(wf, startNodeId, items, parent);
    if (scheduled.status !== "pending") return scheduled;
    return await this.engine.waitForCompletion(scheduled.runId);
  }

  private findDefaultStartNodeId(wf: WorkflowDefinition): NodeId {
    const firstTrigger = wf.nodes.find((n) => n.kind === "trigger")?.id;
    if (firstTrigger) return firstTrigger;

    const incoming = new Map<NodeId, number>();
    for (const n of wf.nodes) incoming.set(n.id, 0);
    for (const e of wf.edges) incoming.set(e.to.nodeId, (incoming.get(e.to.nodeId) ?? 0) + 1);

    const start = wf.nodes.find((n) => (incoming.get(n.id) ?? 0) === 0)?.id;
    return (
      start ??
      wf.nodes[0]?.id ??
      (() => {
        throw new Error(`Workflow ${wf.id} has no nodes`);
      })()
    );
  }
}

