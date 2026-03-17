import { inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import type { WorkflowDebuggerOverlayRepository } from "../../domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDefinitionRepository } from "../../domain/workflows/WorkflowDefinitionRepository";
import type { WorkflowDebuggerOverlayState } from "../../domain/workflows/WorkflowDebuggerOverlayState";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { CommandHandler } from "../bus/CommandHandler";
import type { WorkflowDebuggerOverlayResponse } from "../contracts/WorkflowDebuggerContracts";
import { WorkflowDebuggerOverlayStateFactory } from "../workflows/WorkflowDebuggerOverlayStateFactory";
import { CopyRunToWorkflowDebuggerCommand } from "./CopyRunToWorkflowDebuggerCommand";

@HandlesCommand.for(CopyRunToWorkflowDebuggerCommand)
export class CopyRunToWorkflowDebuggerCommandHandler extends CommandHandler<
  CopyRunToWorkflowDebuggerCommand,
  WorkflowDebuggerOverlayResponse
> {
  constructor(
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
    @inject(ApplicationTokens.WorkflowDefinitionRepository)
    private readonly workflowDefinitionRepository: WorkflowDefinitionRepository,
    @inject(ApplicationTokens.WorkflowDebuggerOverlayRepository)
    private readonly workflowDebuggerOverlayRepository: WorkflowDebuggerOverlayRepository,
  ) {
    super();
  }

  async execute(command: CopyRunToWorkflowDebuggerCommand): Promise<WorkflowDebuggerOverlayState> {
    if (!command.body.sourceRunId) {
      throw new ApplicationRequestError(400, "Missing sourceRunId");
    }
    const workflowId = decodeURIComponent(command.workflowId);
    const sourceState = await this.workflowRunRepository.load(command.body.sourceRunId);
    if (!sourceState) {
      throw new ApplicationRequestError(404, "Unknown runId");
    }
    if (sourceState.workflowId !== workflowId) {
      throw new ApplicationRequestError(400, "Run does not belong to the requested workflow");
    }
    const workflow = await this.workflowDefinitionRepository.getDefinition(workflowId);
    if (!workflow) {
      throw new ApplicationRequestError(404, "Unknown workflowId");
    }
    const existingOverlay = await this.workflowDebuggerOverlayRepository.load(workflowId);
    const nextOverlay = WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay({
      workflowId,
      sourceState,
      liveWorkflowNodeIds: new Set(workflow.nodes.map((node) => node.id)),
      existingOverlay,
    });
    await this.workflowDebuggerOverlayRepository.save(nextOverlay);
    return nextOverlay;
  }
}
