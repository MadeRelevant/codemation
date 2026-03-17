import type { WorkflowDebuggerOverlayState } from "./WorkflowDebuggerOverlayState";

export interface WorkflowDebuggerOverlayRepository {
  load(workflowId: string): Promise<WorkflowDebuggerOverlayState | undefined>;

  save(state: WorkflowDebuggerOverlayState): Promise<void>;
}
