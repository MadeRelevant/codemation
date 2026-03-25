import type { WorkflowDefinition } from "@codemation/core";

/**
 * Collects exported values that match the {@link WorkflowDefinition} shape.
 * Other exports (helpers, constants, type-only re-exports) are ignored.
 */
export class WorkflowDefinitionExportsResolver {
  resolve(moduleExports: Readonly<Record<string, unknown>>): ReadonlyArray<WorkflowDefinition> {
    const workflows: WorkflowDefinition[] = [];
    for (const exportedValue of Object.values(moduleExports)) {
      if (this.isWorkflowDefinition(exportedValue)) {
        workflows.push(exportedValue);
      }
    }
    return workflows;
  }

  private isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
    if (!value || typeof value !== "object") {
      return false;
    }
    return "id" in value && "name" in value && "nodes" in value && "edges" in value;
  }
}
