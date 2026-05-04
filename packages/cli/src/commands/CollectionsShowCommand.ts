import { GetCollectionQuery } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import type { CollectionDetailDto, CollectionFieldDto, CollectionIndexDto } from "@codemation/host/dto";

import type { CollectionsCliBootstrap } from "../collections/CollectionsCliBootstrap";
import type {
  CollectionsCliCommandOptionsRaw,
  CollectionsCliOptionsParser,
} from "../collections/CollectionsCliOptionsParser";
import { CliAsciiTableBuilder } from "../util/CliAsciiTableBuilder";

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
    const fieldTable = CliAsciiTableBuilder.build([...fieldHeaders], fieldRows);

    let indexSection = "";
    if (detail.indexes.length > 0) {
      const indexHeaders = ["Fields", "Unique"] as const;
      const indexRows: ReadonlyArray<ReadonlyArray<string>> = detail.indexes.map((idx: CollectionIndexDto) => [
        idx.fields.join(", "),
        idx.unique ? "yes" : "no",
      ]);
      indexSection = `\nIndexes:\n${CliAsciiTableBuilder.build([...indexHeaders], indexRows)}`;
    }
    return `Collection: ${detail.name}\n\nFields:\n${fieldTable}${indexSection}`;
  }
}
