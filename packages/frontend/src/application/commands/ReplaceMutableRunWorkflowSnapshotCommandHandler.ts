import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { ApplicationTokens } from "../../applicationTokens";
import { CommandHandler } from "../bus/CommandHandler";
import { inject, type PersistedRunState } from "@codemation/core";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { ReplaceMutableRunWorkflowSnapshotCommand } from "./ReplaceMutableRunWorkflowSnapshotCommand";

@HandlesCommand.for(ReplaceMutableRunWorkflowSnapshotCommand)
export class ReplaceMutableRunWorkflowSnapshotCommandHandler extends CommandHandler<
  ReplaceMutableRunWorkflowSnapshotCommand,
  PersistedRunState
> {
  constructor(
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
  ) {
    super();
  }

  async execute(command: ReplaceMutableRunWorkflowSnapshotCommand): Promise<PersistedRunState> {
    if (!command.body.workflowSnapshot) {
      throw new ApplicationRequestError(400, "Missing workflowSnapshot");
    }
    const state = await this.workflowRunRepository.load(command.runId);
    if (!state) {
      throw new ApplicationRequestError(404, "Unknown runId");
    }
    if (!state.executionOptions?.isMutable) {
      throw new ApplicationRequestError(403, `Run ${state.runId} is immutable`);
    }
    await this.workflowRunRepository.save({
      ...state,
      status: "completed",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      workflowSnapshot: command.body.workflowSnapshot,
    });
    const updated = await this.workflowRunRepository.load(state.runId);
    if (!updated) {
      throw new ApplicationRequestError(404, "Unknown runId");
    }
    return updated;
  }
}
