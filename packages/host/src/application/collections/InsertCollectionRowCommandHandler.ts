import { inject } from "@codemation/core";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";
import { CommandHandler } from "../bus/CommandHandler";
import type { CollectionRowDto } from "../contracts/CollectionContracts.types";
import { CollectionRegistry } from "../../infrastructure/collections/CollectionRegistry";
import { CollectionStoreRegistry } from "../../infrastructure/collections/CollectionStoreRegistry";
import { CollectionsTokens } from "../../infrastructure/collections/CollectionsTokens";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { InsertCollectionRowCommand } from "./InsertCollectionRowCommand";

@HandlesCommand.forCommand(InsertCollectionRowCommand)
export class InsertCollectionRowCommandHandler extends CommandHandler<InsertCollectionRowCommand, CollectionRowDto> {
  constructor(
    @inject(CollectionRegistry)
    private readonly collectionRegistry: CollectionRegistry,
    @inject(CollectionsTokens.CollectionStoreRegistry)
    private readonly storeRegistry: CollectionStoreRegistry,
  ) {
    super();
  }

  async execute(command: InsertCollectionRowCommand): Promise<CollectionRowDto> {
    if (!this.collectionRegistry.has(command.name)) {
      throw new ApplicationRequestError(404, `Collection "${command.name}" not found`);
    }
    const store = this.storeRegistry.get(command.name);
    if (!store) {
      throw new ApplicationRequestError(404, `Collection "${command.name}" has no active store`);
    }
    const row = await store.insert(command.data);
    const { id, created_at, updated_at, ...rest } = row;
    return {
      id,
      created_at: created_at instanceof Date ? created_at.toISOString() : String(created_at),
      updated_at: updated_at instanceof Date ? updated_at.toISOString() : String(updated_at),
      data: rest,
    };
  }
}
