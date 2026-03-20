import { Command } from "../bus/Command";
import type { CopyRunToWorkflowDebuggerRequest,WorkflowDebuggerOverlayResponse } from "../contracts/WorkflowDebuggerContracts";

export class CopyRunToWorkflowDebuggerCommand extends Command<WorkflowDebuggerOverlayResponse> {
  constructor(
    public readonly workflowId: string,
    public readonly body: CopyRunToWorkflowDebuggerRequest,
  ) {
    super();
  }
}
