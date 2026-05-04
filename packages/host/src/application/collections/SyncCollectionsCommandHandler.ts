import { inject } from "@codemation/core";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";
import { CommandHandler } from "../bus/CommandHandler";
import type { SyncCollectionsResponseDto } from "../contracts/CollectionContracts.types";
import { CollectionSchemaSyncerHolder } from "../../infrastructure/collections/CollectionSchemaSyncerHolder";
import { SyncCollectionsCommand } from "./SyncCollectionsCommand";

@HandlesCommand.forCommand(SyncCollectionsCommand)
export class SyncCollectionsCommandHandler extends CommandHandler<SyncCollectionsCommand, SyncCollectionsResponseDto> {
  constructor(
    @inject(CollectionSchemaSyncerHolder)
    private readonly syncerHolder: CollectionSchemaSyncerHolder,
  ) {
    super();
  }

  async execute(command: SyncCollectionsCommand): Promise<SyncCollectionsResponseDto> {
    const result = await this.syncerHolder.syncIfAvailable({ dryRun: command.dryRun });
    if (!result) {
      return { planned: 0, applied: 0, dryRun: command.dryRun };
    }
    return {
      planned: result.planned.length,
      applied: result.applied.length,
      dryRun: command.dryRun,
    };
  }
}
