import { ListCollectionsQuery } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import type { CollectionSummaryDto } from "@codemation/host/dto";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";
import { CliAsciiTableBuilder } from "../util/CliAsciiTableBuilder";

export type CollectionsListCommandOptionsRaw = CollectionsCliCommandOptionsRaw &
  Readonly<{ format?: "table" | "json" }>;

export class CollectionsListCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: CollectionsCliBootstrap,
    private readonly optionsParser: CollectionsCliOptionsParser,
  ) {}

  async execute(rawOptions: CollectionsListCommandOptionsRaw): Promise<void> {
    const opts = this.optionsParser.parse(rawOptions);
    const format = rawOptions.format ?? "table";
    await this.bootstrap.withSession(opts, async (session) => {
      const collections = await session.getQueryBus().execute(new ListCollectionsQuery());
      if (format === "json") {
        this.cliLogger.info(JSON.stringify(collections, null, 2));
        return;
      }
      if (collections.length === 0) {
        this.cliLogger.info("No collections registered.");
        return;
      }
      this.cliLogger.info(this.formatTable(collections));
    });
  }

  private formatTable(collections: ReadonlyArray<CollectionSummaryDto>): string {
    const headers = ["Name", "Fields", "Rows"] as const;
    const rows: ReadonlyArray<ReadonlyArray<string>> = collections.map((c) => [
      c.name,
      String(c.fieldCount),
      c.rowCount.toLocaleString(),
    ]);
    return CliAsciiTableBuilder.build([...headers], rows);
  }
}
