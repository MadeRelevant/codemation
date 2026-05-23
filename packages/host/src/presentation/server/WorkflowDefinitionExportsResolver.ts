import type { WorkflowDefinition } from "@codemation/core";
import { WorkflowEdgePortValidator } from "@codemation/core";

/**
 * Collects exported values that match the {@link WorkflowDefinition} shape.
 * Other exports (helpers, constants, type-only re-exports) are ignored.
 *
 * Throws if any workflow's edges reference output ports not declared by the
 * source node config. All violations are reported at once so an agent can
 * self-correct in a single pass.
 */
export class WorkflowDefinitionExportsResolver {
  private readonly portValidator = new WorkflowEdgePortValidator();

  resolve(moduleExports: Readonly<Record<string, unknown>>): ReadonlyArray<WorkflowDefinition> {
    const workflows: WorkflowDefinition[] = [];
    for (const exportedValue of Object.values(moduleExports)) {
      if (this.isWorkflowDefinition(exportedValue)) {
        this.validatePorts(exportedValue);
        workflows.push(exportedValue);
      }
    }
    return workflows;
  }

  private validatePorts(workflow: WorkflowDefinition): void {
    const result = this.portValidator.validate(workflow);
    if (!result.valid) {
      const lines = result.errors.map((e) => `  - ${e.message}`).join("\n");
      throw new Error(
        `Workflow "${workflow.id}" ("${workflow.name}") has ${result.errors.length} invalid edge port(s):\n${lines}`,
      );
    }
  }

  private isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
    if (!value || typeof value !== "object") {
      return false;
    }
    return "id" in value && "name" in value && "nodes" in value && "edges" in value;
  }
}
