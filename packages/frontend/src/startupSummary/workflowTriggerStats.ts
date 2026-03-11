import type { WorkflowDefinition } from "@codemation/core";

export class WorkflowTriggerStats {
  readonly workflowCount: number;
  readonly triggerWorkflowCount: number;
  readonly triggerNodeCount: number;

  constructor(workflowDefinitions: ReadonlyArray<WorkflowDefinition>) {
    this.workflowCount = workflowDefinitions.length;
    this.triggerWorkflowCount = workflowDefinitions.filter((workflow) => workflow.nodes.some((node) => node.kind === "trigger")).length;
    this.triggerNodeCount = workflowDefinitions.reduce(
      (count, workflow) => count + workflow.nodes.filter((node) => node.kind === "trigger").length,
      0,
    );
  }
}
