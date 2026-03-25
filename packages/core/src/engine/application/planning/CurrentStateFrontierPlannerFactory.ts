import { CurrentStateFrontierPlanner } from "../../domain/planning/currentStateFrontierPlanner";
import type { WorkflowTopology } from "../../domain/planning/WorkflowTopologyPlanner";

export class CurrentStateFrontierPlannerFactory {
  create(topology: WorkflowTopology): CurrentStateFrontierPlanner {
    return new CurrentStateFrontierPlanner(topology);
  }
}
