import type { WorkflowDefinition } from "@codemation/core";

export class CodemationWorkflowExportCollector {
  collect(moduleExports: Readonly<Record<string, unknown>>): ReadonlyArray<WorkflowDefinition> {
    const workflows: WorkflowDefinition[] = [];
    for (const exportedValue of Object.values(moduleExports)) {
      workflows.push(...this.collectFromValue(exportedValue));
    }
    return this.dedupe(workflows);
  }

  private collectFromValue(value: unknown): ReadonlyArray<WorkflowDefinition> {
    if (this.isWorkflowDefinition(value)) return [value];
    if (Array.isArray(value)) return value.filter((entry): entry is WorkflowDefinition => this.isWorkflowDefinition(entry));
    return [];
  }

  private isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<WorkflowDefinition>;
    return typeof candidate.id === "string" && typeof candidate.name === "string" && Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
  }

  private dedupe(workflows: ReadonlyArray<WorkflowDefinition>): ReadonlyArray<WorkflowDefinition> {
    const uniqueById = new Map<string, WorkflowDefinition>();
    for (const workflow of workflows) uniqueById.set(workflow.id, workflow);
    return [...uniqueById.values()];
  }
}
