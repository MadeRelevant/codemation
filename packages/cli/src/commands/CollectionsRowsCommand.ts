import { ListCollectionRowsQuery } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import type { CollectionRowDto } from "@codemation/host/dto";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";

export type CollectionsRowsCommandOptionsRaw = CollectionsCliCommandOptionsRaw &
  Readonly<{
    name: string;
    limit?: string;
    offset?: string;
    where?: ReadonlyArray<string>;
    format?: "table" | "json";
  }>;

export class CollectionsRowsCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: CollectionsCliBootstrap,
    private readonly optionsParser: CollectionsCliOptionsParser,
  ) {}

  async execute(rawOptions: CollectionsRowsCommandOptionsRaw): Promise<void> {
    const opts = this.optionsParser.parse(rawOptions);
    const format = rawOptions.format ?? "table";
    const limit = rawOptions.limit !== undefined ? parseInt(rawOptions.limit, 10) : 20;
    const offset = rawOptions.offset !== undefined ? parseInt(rawOptions.offset, 10) : 0;
    const where = this.parseWhere(rawOptions.where);

    await this.bootstrap.withSession(opts, async (session) => {
      const result = await session
        .getQueryBus()
        .execute(new ListCollectionRowsQuery(rawOptions.name, limit, offset, where));
      if (format === "json") {
        this.cliLogger.info(JSON.stringify(result, null, 2));
        return;
      }
      const { rows, total } = result;
      if (rows.length === 0) {
        this.cliLogger.info(`No rows found (total: ${total}).`);
        return;
      }
      this.cliLogger.info(`Showing ${rows.length} of ${total} rows (offset: ${offset}):`);
      this.cliLogger.info(this.formatRows(rows));
    });
  }

  private parseWhere(pairs: ReadonlyArray<string> | undefined): Readonly<Record<string, unknown>> | undefined {
    if (!pairs || pairs.length === 0) return undefined;
    const where: Record<string, unknown> = {};
    for (const pair of pairs) {
      const eqIndex = pair.indexOf("=");
      if (eqIndex < 0) continue;
      const key = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      if (key.length > 0) {
        where[key] = value;
      }
    }
    return Object.keys(where).length > 0 ? where : undefined;
  }

  private formatRows(rows: ReadonlyArray<CollectionRowDto>): string {
    const headers = ["id", "created_at", "updated_at", "data"] as const;
    const tableRows: ReadonlyArray<ReadonlyArray<string>> = rows.map((r) => [
      r.id,
      r.created_at,
      r.updated_at,
      JSON.stringify(r.data),
    ]);
    return this.buildAsciiTable([...headers], tableRows);
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
