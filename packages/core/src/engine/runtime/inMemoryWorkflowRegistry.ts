import type { WorkflowDefinition,WorkflowId,WorkflowRegistry } from "../../types";

export class InMemoryWorkflowRegistry implements WorkflowRegistry {
  private readonly workflowsById = new Map<WorkflowId, WorkflowDefinition>();

  setWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    this.workflowsById.clear();
    for (const workflow of workflows) {
      this.workflowsById.set(workflow.id, workflow);
    }
  }

  list(): ReadonlyArray<WorkflowDefinition> {
    return [...this.workflowsById.values()];
  }

  get(workflowId: WorkflowId): WorkflowDefinition | undefined {
    return this.workflowsById.get(workflowId);
  }
}
