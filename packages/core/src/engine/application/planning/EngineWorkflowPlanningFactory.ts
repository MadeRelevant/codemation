import type { WorkflowDefinition, WorkflowNodeInstanceFactory } from "../../../types";

import { DirectedCycleDetector } from "../../planning/DirectedCycleDetector";
import { RunQueuePlanner } from "../../planning/runQueuePlanner";
import { WorkflowTopology } from "../../planning/WorkflowTopologyPlanner";

export class EngineWorkflowPlanningFactory {
  constructor(
    private readonly workflowNodeInstanceFactory: WorkflowNodeInstanceFactory,
    private readonly directedCycleDetector: DirectedCycleDetector,
  ) {}

  create(workflow: WorkflowDefinition): Readonly<{ topology: WorkflowTopology; planner: RunQueuePlanner }> {
    this.directedCycleDetector.validateAcyclic(workflow);
    const topology = WorkflowTopology.fromWorkflow(workflow);
    const nodeInstances = this.workflowNodeInstanceFactory.createNodes(workflow);
    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();
    return { topology, planner };
  }
}
