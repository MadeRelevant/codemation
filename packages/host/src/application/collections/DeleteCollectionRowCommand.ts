import { Command } from "../bus/Command";

export class DeleteCollectionRowCommand extends Command<{ readonly deleted: boolean }> {
  constructor(
    public readonly name: string,
    public readonly id: string,
  ) {
    super();
  }
}
