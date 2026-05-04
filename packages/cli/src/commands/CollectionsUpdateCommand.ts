import { UpdateCollectionRowCommand } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";

export type CollectionsUpdateCommandOptionsRaw = CollectionsCliCommandOptionsRaw &
  Readonly<{
    name: string;
    id: string;
    patch?: string;
  }>;

export class CollectionsUpdateCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: CollectionsCliBootstrap,
    private readonly optionsParser: CollectionsCliOptionsParser,
  ) {}

  async execute(rawOptions: CollectionsUpdateCommandOptionsRaw): Promise<void> {
    const opts = this.optionsParser.parse(rawOptions);
    const patch = this.parsePatch(rawOptions.patch);
    await this.bootstrap.withSession(opts, async (session) => {
      const row = await session
        .getCommandBus()
        .execute(new UpdateCollectionRowCommand(rawOptions.name, rawOptions.id, patch));
      this.cliLogger.info(`Updated row with id: ${row.id}`);
      this.cliLogger.info(JSON.stringify(row, null, 2));
    });
  }

  private parsePatch(patchJson: string | undefined): Readonly<Record<string, unknown>> {
    if (patchJson !== undefined && patchJson.trim().length > 0) {
      return JSON.parse(patchJson) as Record<string, unknown>;
    }
    return {};
  }
}
