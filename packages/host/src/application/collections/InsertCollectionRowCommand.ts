import { Command } from "../bus/Command";
import type { CollectionRowDto } from "../contracts/CollectionContracts.types";

export class InsertCollectionRowCommand extends Command<CollectionRowDto> {
  constructor(
    public readonly name: string,
    public readonly data: Readonly<Record<string, unknown>>,
  ) {
    super();
  }
}
