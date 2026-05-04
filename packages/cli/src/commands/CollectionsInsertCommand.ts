import { InsertCollectionRowCommand } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";

export type CollectionsInsertCommandOptionsRaw = CollectionsCliCommandOptionsRaw &
  Readonly<{
    name: string;
    data?: string;
    field?: ReadonlyArray<string>;
  }>;

export class CollectionsInsertCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: CollectionsCliBootstrap,
    private readonly optionsParser: CollectionsCliOptionsParser,
  ) {}

  async execute(rawOptions: CollectionsInsertCommandOptionsRaw): Promise<void> {
    const opts = this.optionsParser.parse(rawOptions);
    const data = this.parseData(rawOptions);
    await this.bootstrap.withSession(opts, async (session) => {
      const row = await session.getCommandBus().execute(new InsertCollectionRowCommand(rawOptions.name, data));
      this.cliLogger.info(`Inserted row with id: ${row.id}`);
      this.cliLogger.info(JSON.stringify(row, null, 2));
    });
  }

  private parseData(rawOptions: CollectionsInsertCommandOptionsRaw): Readonly<Record<string, unknown>> {
    if (rawOptions.data !== undefined && rawOptions.data.trim().length > 0) {
      return JSON.parse(rawOptions.data) as Record<string, unknown>;
    }
    if (rawOptions.field !== undefined && rawOptions.field.length > 0) {
      return this.parseFieldPairs(rawOptions.field);
    }
    return {};
  }

  private parseFieldPairs(pairs: ReadonlyArray<string>): Readonly<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const pair of pairs) {
      const eqIndex = pair.indexOf("=");
      if (eqIndex < 0) continue;
      const key = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      if (key.length > 0) {
        result[key] = value;
      }
    }
    return result;
  }
}
