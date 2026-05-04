import { DeleteCollectionRowCommand } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";

export type CollectionsDeleteCommandOptionsRaw = CollectionsCliCommandOptionsRaw &
  Readonly<{ name: string; id: string }>;

export class CollectionsDeleteCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: CollectionsCliBootstrap,
    private readonly optionsParser: CollectionsCliOptionsParser,
  ) {}

  async execute(rawOptions: CollectionsDeleteCommandOptionsRaw): Promise<void> {
    const opts = this.optionsParser.parse(rawOptions);
    await this.bootstrap.withSession(opts, async (session) => {
      const result = await session
        .getCommandBus()
        .execute(new DeleteCollectionRowCommand(rawOptions.name, rawOptions.id));
      if (result.deleted) {
        this.cliLogger.info(`Deleted row "${rawOptions.id}" from collection "${rawOptions.name}".`);
      } else {
        this.cliLogger.info(`Row "${rawOptions.id}" not found in collection "${rawOptions.name}".`);
      }
    });
  }
}
