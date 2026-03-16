import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { ApplicationTokens } from "../../applicationTokens";
import { CommandHandler } from "../bus/CommandHandler";
import { inject, type PersistedRunState } from "@codemation/core";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { SetPinnedNodeInputCommand } from "./SetPinnedNodeInputCommand";

@HandlesCommand.for(SetPinnedNodeInputCommand)
export class SetPinnedNodeInputCommandHandler extends CommandHandler<SetPinnedNodeInputCommand, PersistedRunState> {
  constructor(
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
  ) {
    super();
  }

  async execute(command: SetPinnedNodeInputCommand): Promise<PersistedRunState> {
    const state = await this.workflowRunRepository.load(command.runId);
    if (!state) {
      throw new ApplicationRequestError(404, "Unknown runId");
    }
    if (!state.executionOptions?.isMutable) {
      throw new ApplicationRequestError(403, `Run ${state.runId} is immutable`);
    }
    const decodedNodeId = decodeURIComponent(command.nodeId);
    const nextNodesById = {
      ...(state.mutableState?.nodesById ?? {}),
      [decodedNodeId]: {
        ...(state.mutableState?.nodesById?.[decodedNodeId] ?? {}),
        pinnedOutputsByPort: command.body.items ? { main: command.body.items } : undefined,
      },
    };
    await this.workflowRunRepository.save({
      ...state,
      mutableState: {
        nodesById: nextNodesById,
      },
    });
    const updated = await this.workflowRunRepository.load(state.runId);
    if (!updated) {
      throw new ApplicationRequestError(404, "Unknown runId");
    }
    return updated;
  }
}
