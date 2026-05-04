import { GetCollectionQuery } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import type { CollectionDetailDto, CollectionFieldDto, CollectionIndexDto } from "@codemation/host/dto";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";

export type CollectionsShowCommandOptionsRaw = CollectionsCliCommandOptionsRaw &
  Readonly<{ name: string; format?: "table" | "json" }>;

export class CollectionsShowCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: CollectionsCliBootstrap,
    private readonly optionsParser: CollectionsCliOptionsParser,
  ) {}

  async execute(rawOptions: CollectionsShowCommandOptionsRaw): Promise<void> {
    const opts = this.optionsParser.parse(rawOptions);
    const format = rawOptions.format ?? "table";
    await this.bootstrap.withSession(opts, async (session) => {
      const detail = await session.getQueryBus().execute(new GetCollectionQuery(rawOptions.name));
      if (detail === null) {
        this.cliLogger.info(`Collection "${rawOptions.name}" not found.`);
        return;
      }
      if (format === "json") {
        this.cliLogger.info(JSON.stringify(detail, null, 2));
        return;
      }
      this.cliLogger.info(this.formatDetail(detail));
    });
  }

  private formatDetail(detail: CollectionDetailDto): string {
    const fieldHeaders = ["Field", "Type", "Nullable", "Has Default"] as const;
    const fieldRows: ReadonlyArray<ReadonlyArray<string>> = detail.fields.map((f: CollectionFieldDto) => [
      f.name,
      f.type,
      f.nullable ? "yes" : "no",
      f.hasDefault ? "yes" : "no",
    ]);
    const fieldTable = this.buildAsciiTable([...fieldHeaders], fieldRows);

    let indexSection = "";
    if (detail.indexes.length > 0) {
      const indexHeaders = ["Fields", "Unique"] as const;
      const indexRows: ReadonlyArray<ReadonlyArray<string>> = detail.indexes.map((idx: CollectionIndexDto) => [
        idx.fields.join(", "),
        idx.unique ? "yes" : "no",
      ]);
      indexSection = `\nIndexes:\n${this.buildAsciiTable([...indexHeaders], indexRows)}`;
    }
    return `Collection: ${detail.name}\n\nFields:\n${fieldTable}${indexSection}`;
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
