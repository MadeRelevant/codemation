import { ItemsInputNormalizer,inject,type PersistedRunState } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { CommandHandler } from "../bus/CommandHandler";
import { SetPinnedNodeInputCommand } from "./SetPinnedNodeInputCommand";

@HandlesCommand.forCommand(SetPinnedNodeInputCommand)
export class SetPinnedNodeInputCommandHandler extends CommandHandler<SetPinnedNodeInputCommand, PersistedRunState> {
  constructor(
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
    @inject(ItemsInputNormalizer)
    private readonly itemsInputNormalizer: ItemsInputNormalizer,
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
    const pinnedItems = command.body.items == null ? undefined : this.itemsInputNormalizer.normalize(command.body.items);
    const nextNodesById = {
      ...(state.mutableState?.nodesById ?? {}),
      [decodedNodeId]: {
        ...(state.mutableState?.nodesById?.[decodedNodeId] ?? {}),
        pinnedOutputsByPort: pinnedItems ? { main: pinnedItems } : undefined,
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
