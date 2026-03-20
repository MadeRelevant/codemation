import { Command } from "../bus/Command";
import type { CreateRunRequest,RunCommandResult } from "../contracts/RunContracts";

export class StartWorkflowRunCommand extends Command<RunCommandResult> {
  constructor(public readonly body: CreateRunRequest) {
    super();
  }
}
