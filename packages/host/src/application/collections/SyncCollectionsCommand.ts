import { Command } from "../bus/Command";
import type { SyncCollectionsResponseDto } from "../contracts/CollectionContracts.types";

export class SyncCollectionsCommand extends Command<SyncCollectionsResponseDto> {
  constructor(public readonly dryRun: boolean) {
    super();
  }
}
