import type { WorkflowDebuggerOverlayResponse, UpdateWorkflowDebuggerOverlayRequest } from "../contracts/WorkflowDebuggerContracts";
import { Command } from "../bus/Command";

export class ReplaceWorkflowDebuggerOverlayCommand extends Command<WorkflowDebuggerOverlayResponse> {
  constructor(
    public readonly workflowId: string,
    public readonly body: UpdateWorkflowDebuggerOverlayRequest,
  ) {
    super();
  }
}
