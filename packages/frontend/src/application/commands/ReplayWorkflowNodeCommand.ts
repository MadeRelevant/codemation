import { Command } from "../bus/Command";
import type { RunCommandResult, RunNodeRequest } from "../contracts/RunContracts";

export class ReplayWorkflowNodeCommand extends Command<RunCommandResult> {
  constructor(
    public readonly runId: string,
    public readonly nodeId: string,
    public readonly body: RunNodeRequest,
  ) {
    super();
  }
}
