import { CurrentStateFrontierPlanner } from "../../planning/currentStateFrontierPlanner";
import type { WorkflowTopology } from "../../planning/WorkflowTopologyPlanner";

export class CurrentStateFrontierPlannerFactory {
  create(topology: WorkflowTopology): CurrentStateFrontierPlanner {
    return new CurrentStateFrontierPlanner(topology);
  }
}
