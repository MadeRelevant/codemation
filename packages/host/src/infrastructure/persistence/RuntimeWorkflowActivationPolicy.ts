import type { WorkflowActivationPolicy, WorkflowId } from "@codemation/core";
import { injectable } from "@codemation/core";
import type { WorkflowActivationRepository } from "../../domain/workflows/WorkflowActivationRepository";

/**
 * In-memory activation map: missing workflow id ⇒ inactive. Hydrated from persistence at startup and updated on command.
 */
@injectable()
export class RuntimeWorkflowActivationPolicy implements WorkflowActivationPolicy {
  private readonly activeByWorkflowId = new Map<string, boolean>();

  async hydrateFromRepository(repository: WorkflowActivationRepository): Promise<void> {
    const rows = await repository.loadAll();
    this.activeByWorkflowId.clear();
    for (const row of rows) {
      this.activeByWorkflowId.set(decodeURIComponent(row.workflowId), row.isActive);
    }
  }

  set(workflowId: string, active: boolean): void {
    this.activeByWorkflowId.set(decodeURIComponent(workflowId), active);
  }

  isActive(workflowId: WorkflowId): boolean {
    return this.activeByWorkflowId.get(workflowId) ?? false;
  }
}
