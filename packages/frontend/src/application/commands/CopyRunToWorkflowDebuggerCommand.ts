import type { WorkflowDebuggerOverlayResponse, CopyRunToWorkflowDebuggerRequest } from "../contracts/WorkflowDebuggerContracts";
import { Command } from "../bus/Command";

export class CopyRunToWorkflowDebuggerCommand extends Command<WorkflowDebuggerOverlayResponse> {
  constructor(
    public readonly workflowId: string,
    public readonly body: CopyRunToWorkflowDebuggerRequest,
  ) {
    super();
  }
}
