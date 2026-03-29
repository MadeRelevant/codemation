import type {
  Items,
  NodeId,
  ParentExecutionRef,
  RunResult,
  WorkflowDefinition,
  WorkflowId,
  WorkflowRepository,
} from "../types";
import { WorkflowExecutableNodeClassifierFactory } from "../workflow";

import { Engine } from "../orchestration/Engine";

export class EngineWorkflowRunnerService {
  constructor(
    private readonly engine: Engine,
    private readonly workflowRepository: WorkflowRepository,
  ) {}

  async runById(args: {
    workflowId: WorkflowId;
    startAt?: NodeId;
    items: Items;
    parent?: ParentExecutionRef;
  }): Promise<RunResult> {
    const { workflowId, startAt, items, parent } = args;
    const wf = this.workflowRepository.get(workflowId);
    if (!wf) throw new Error(`Unknown workflowId: ${workflowId}`);

    const startNodeId = startAt ?? this.findDefaultStartNodeId(wf);
    const scheduled = await this.engine.runWorkflow(wf, startNodeId, items, parent);
    if (scheduled.status !== "pending") return scheduled;
    return await this.engine.waitForCompletion(scheduled.runId);
  }

  private findDefaultStartNodeId(wf: WorkflowDefinition): NodeId {
    return WorkflowExecutableNodeClassifierFactory.create(wf).findDefaultExecutableStartNodeId(wf);
  }
}
