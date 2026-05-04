import { SyncCollectionsCommand } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";

export type CollectionsSyncCommandOptionsRaw = CollectionsCliCommandOptionsRaw & Readonly<{ dryRun?: boolean }>;

export class CollectionsSyncCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: CollectionsCliBootstrap,
    private readonly optionsParser: CollectionsCliOptionsParser,
  ) {}

  async execute(rawOptions: CollectionsSyncCommandOptionsRaw): Promise<void> {
    const opts = this.optionsParser.parse(rawOptions);
    const dryRun = rawOptions.dryRun === true;
    await this.bootstrap.withSession(opts, async (session) => {
      const result = await session.getCommandBus().execute(new SyncCollectionsCommand(dryRun));
      const mode = result.dryRun ? " (dry run)" : "";
      this.cliLogger.info(`Schema sync complete${mode}: ${result.planned} planned, ${result.applied} applied.`);
    });
  }
}
