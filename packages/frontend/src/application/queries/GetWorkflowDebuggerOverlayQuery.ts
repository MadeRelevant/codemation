import type { WorkflowDebuggerOverlayState } from "../../domain/workflows/WorkflowDebuggerOverlayState";
import { Query } from "../bus/Query";

export class GetWorkflowDebuggerOverlayQuery extends Query<WorkflowDebuggerOverlayState> {
  constructor(public readonly workflowId: string) {
    super();
  }
}
