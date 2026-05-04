import { ListCollectionsQuery } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import type { CollectionSummaryDto } from "@codemation/host/dto";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";

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
    const headers = ["Name", "Fields"] as const;
    const rows: ReadonlyArray<ReadonlyArray<string>> = collections.map((c) => [c.name, String(c.fieldCount)]);
    return this.buildAsciiTable([...headers], rows);
  }

  private buildAsciiTable(headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): string {
    const columnCount = headers.length;
    const widths: number[] = [];
    for (let i = 0; i < columnCount; i += 1) {
      const headerWidth = headers[i]?.length ?? 0;
      const cellWidths = rows.map((row) => row[i]?.length ?? 0);
      widths.push(Math.max(headerWidth, ...cellWidths, 3));
    }
    const padCell = (text: string, index: number): string => text.padEnd(widths[index] ?? text.length);
    const horizontal = `+${widths.map((w) => "-".repeat(w + 2)).join("+")}+`;
    const formatRow = (cells: ReadonlyArray<string>): string =>
      `| ${cells.map((cell, index) => padCell(cell, index)).join(" | ")} |`;
    return [horizontal, formatRow(headers), horizontal, ...rows.map(formatRow), horizontal].join("\n");
  }
}
