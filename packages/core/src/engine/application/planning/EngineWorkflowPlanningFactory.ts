import type { WorkflowDefinition, WorkflowNodeInstanceFactory } from "../../../types";

import { RunQueuePlanner } from "../../domain/planning/runQueuePlanner";
import { WorkflowTopology } from "../../domain/planning/WorkflowTopologyPlanner";

export class EngineWorkflowPlanningFactory {
  constructor(private readonly workflowNodeInstanceFactory: WorkflowNodeInstanceFactory) {}

  create(workflow: WorkflowDefinition): Readonly<{ topology: WorkflowTopology; planner: RunQueuePlanner }> {
    const topology = WorkflowTopology.fromWorkflow(workflow);
    const nodeInstances = this.workflowNodeInstanceFactory.createNodes(workflow);
    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();
    return { topology, planner };
  }
}

