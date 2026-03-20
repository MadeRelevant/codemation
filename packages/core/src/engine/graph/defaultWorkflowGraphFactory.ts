import type { WorkflowDefinition,WorkflowGraph,WorkflowGraphFactory } from "../../types";
import { ExecutableGraph } from "./executableGraph";

export class DefaultWorkflowGraphFactory implements WorkflowGraphFactory {
  create(def: WorkflowDefinition): WorkflowGraph {
    return new ExecutableGraph(def);
  }
}

