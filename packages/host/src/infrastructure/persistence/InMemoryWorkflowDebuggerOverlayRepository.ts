import { injectable } from "@codemation/core";
import type { WorkflowDebuggerOverlayRepository } from "../../domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDebuggerOverlayState } from "../../domain/workflows/WorkflowDebuggerOverlayState";

@injectable()
export class InMemoryWorkflowDebuggerOverlayRepository implements WorkflowDebuggerOverlayRepository {
  private readonly overlays = new Map<string, WorkflowDebuggerOverlayState>();

  async load(workflowId: string): Promise<WorkflowDebuggerOverlayState | undefined> {
    return this.overlays.get(decodeURIComponent(workflowId));
  }

  async save(state: WorkflowDebuggerOverlayState): Promise<void> {
    this.overlays.set(state.workflowId, state);
  }
}
