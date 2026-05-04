import { Command } from "../bus/Command";
import type { CollectionRowDto } from "../contracts/CollectionContracts.types";

export class UpdateCollectionRowCommand extends Command<CollectionRowDto> {
  constructor(
    public readonly name: string,
    public readonly id: string,
    public readonly patch: Readonly<Record<string, unknown>>,
  ) {
    super();
  }
}
