import { GetCollectionRowQuery } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import type { CollectionRowDto } from "@codemation/host/dto";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";
import { CliAsciiTableBuilder } from "../util/CliAsciiTableBuilder";

export type CollectionsGetCommandOptionsRaw = CollectionsCliCommandOptionsRaw &
  Readonly<{ name: string; id: string; format?: "table" | "json" }>;

export class CollectionsGetCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: CollectionsCliBootstrap,
    private readonly optionsParser: CollectionsCliOptionsParser,
  ) {}

  async execute(rawOptions: CollectionsGetCommandOptionsRaw): Promise<void> {
    const opts = this.optionsParser.parse(rawOptions);
    const format = rawOptions.format ?? "table";
    await this.bootstrap.withSession(opts, async (session) => {
      const row = await session.getQueryBus().execute(new GetCollectionRowQuery(rawOptions.name, rawOptions.id));
      if (row === null) {
        this.cliLogger.info(`Row "${rawOptions.id}" not found in collection "${rawOptions.name}".`);
        return;
      }
      if (format === "json") {
        this.cliLogger.info(JSON.stringify(row, null, 2));
        return;
      }
      this.cliLogger.info(this.formatRow(row));
    });
  }

  private formatRow(row: CollectionRowDto): string {
    const headers = ["Field", "Value"] as const;
    const rows: ReadonlyArray<ReadonlyArray<string>> = [
      ["id", row.id],
      ["created_at", row.created_at],
      ["updated_at", row.updated_at],
      ...Object.entries(row.data).map(([k, v]) => [k, JSON.stringify(v)]),
    ];
    return CliAsciiTableBuilder.build([...headers], rows);
  }
}
