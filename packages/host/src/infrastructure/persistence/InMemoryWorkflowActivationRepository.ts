import { injectable } from "@codemation/core";
import type {
  WorkflowActivationRepository,
  WorkflowActivationRow,
} from "../../domain/workflows/WorkflowActivationRepository";

@injectable()
export class InMemoryWorkflowActivationRepository implements WorkflowActivationRepository {
  private readonly rows = new Map<string, boolean>();

  async loadAll(): Promise<ReadonlyArray<WorkflowActivationRow>> {
    return [...this.rows.entries()].map(([workflowId, isActive]) => ({ workflowId, isActive }));
  }

  async upsert(workflowId: string, active: boolean): Promise<void> {
    this.rows.set(decodeURIComponent(workflowId), active);
  }
}
