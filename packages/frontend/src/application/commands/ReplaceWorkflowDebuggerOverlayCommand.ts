import { Command } from "../bus/Command";
import type { UpdateWorkflowDebuggerOverlayRequest,WorkflowDebuggerOverlayResponse } from "../contracts/WorkflowDebuggerContracts";

export class ReplaceWorkflowDebuggerOverlayCommand extends Command<WorkflowDebuggerOverlayResponse> {
  constructor(
    public readonly workflowId: string,
    public readonly body: UpdateWorkflowDebuggerOverlayRequest,
  ) {
    super();
  }
}
