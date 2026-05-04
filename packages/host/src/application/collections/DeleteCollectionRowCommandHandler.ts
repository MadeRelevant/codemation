import { inject } from "@codemation/core";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";
import { CommandHandler } from "../bus/CommandHandler";
import { CollectionRegistry } from "../../infrastructure/collections/CollectionRegistry";
import { CollectionStoreRegistry } from "../../infrastructure/collections/CollectionStoreRegistry";
import { CollectionsTokens } from "../../infrastructure/collections/CollectionsTokens";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { DeleteCollectionRowCommand } from "./DeleteCollectionRowCommand";

@HandlesCommand.forCommand(DeleteCollectionRowCommand)
export class DeleteCollectionRowCommandHandler extends CommandHandler<
  DeleteCollectionRowCommand,
  { readonly deleted: boolean }
> {
  constructor(
    @inject(CollectionRegistry)
    private readonly collectionRegistry: CollectionRegistry,
    @inject(CollectionsTokens.CollectionStoreRegistry)
    private readonly storeRegistry: CollectionStoreRegistry,
  ) {
    super();
  }

  async execute(command: DeleteCollectionRowCommand): Promise<{ readonly deleted: boolean }> {
    if (!this.collectionRegistry.has(command.name)) {
      throw new ApplicationRequestError(404, `Collection "${command.name}" not found`);
    }
    const store = this.storeRegistry.get(command.name);
    if (!store) {
      throw new ApplicationRequestError(404, `Collection "${command.name}" has no active store`);
    }
    return await store.delete(command.id);
  }
}
