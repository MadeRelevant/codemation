import { inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowDebuggerOverlayRepository } from "../../domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDebuggerOverlayState } from "../../domain/workflows/WorkflowDebuggerOverlayState";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { CommandHandler } from "../bus/CommandHandler";
import type { WorkflowDebuggerOverlayResponse } from "../contracts/WorkflowDebuggerContracts";
import { WorkflowDebuggerOverlayStateFactory } from "../workflows/WorkflowDebuggerOverlayStateFactory";
import { ReplaceWorkflowDebuggerOverlayCommand } from "./ReplaceWorkflowDebuggerOverlayCommand";

@HandlesCommand.for(ReplaceWorkflowDebuggerOverlayCommand)
export class ReplaceWorkflowDebuggerOverlayCommandHandler extends CommandHandler<
  ReplaceWorkflowDebuggerOverlayCommand,
  WorkflowDebuggerOverlayResponse
> {
  constructor(
    @inject(ApplicationTokens.WorkflowDebuggerOverlayRepository)
    private readonly workflowDebuggerOverlayRepository: WorkflowDebuggerOverlayRepository,
  ) {
    super();
  }

  async execute(command: ReplaceWorkflowDebuggerOverlayCommand): Promise<WorkflowDebuggerOverlayState> {
    if (!command.body.currentState) {
      throw new ApplicationRequestError(400, "Missing currentState");
    }
    const nextState = WorkflowDebuggerOverlayStateFactory.replaceCurrentState({
      workflowId: decodeURIComponent(command.workflowId),
      currentState: command.body.currentState,
    });
    await this.workflowDebuggerOverlayRepository.save(nextState);
    return nextState;
  }
}
