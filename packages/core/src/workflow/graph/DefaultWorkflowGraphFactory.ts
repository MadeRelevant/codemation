import type { WorkflowDefinition, WorkflowGraph, WorkflowGraphFactory } from "../../types";
import { ExecutableGraph } from "./ExecutableGraph";

export class DefaultWorkflowGraphFactory implements WorkflowGraphFactory {
  create(def: WorkflowDefinition): WorkflowGraph {
    return new ExecutableGraph(def);
  }
}
