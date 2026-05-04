import type { CollectionSchemaIntrospector } from "./CollectionSchemaIntrospector.types";
import type { ColumnSpec, LiveCollectionTable, LiveCollectionsSchema } from "./collectionSchemaTypes";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";

type SqliteMasterRow = { name: string };
type SqlitePragmaColumn = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};
type SqlitePragmaIndex = { seq: number; name: string; unique: number; origin: string; partial: number };
type SqlitePragmaIndexInfo = { seqno: number; cid: number; name: string };

/**
 * Introspects the live SQLite schema for collections by reading sqlite_master and PRAGMA table_info.
 * Collection tables are identified by the "collections_" prefix.
 */
export class SqliteCollectionSchemaIntrospector implements CollectionSchemaIntrospector {
  constructor(private readonly prismaClient: PrismaDatabaseClient) {}

  async introspect(): Promise<LiveCollectionsSchema> {
    const tables = await this.prismaClient.$queryRaw<SqliteMasterRow[]>`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'collections_%' ORDER BY name
    `;

    const tableMap: Record<string, LiveCollectionTable> = {};

    for (const { name: tableName } of tables) {
      const collectionName = tableName.replace(/^collections_/, "");

      const columnRows = await this.prismaClient.$queryRawUnsafe<SqlitePragmaColumn[]>(
        `PRAGMA table_info("${tableName}")`,
      );

      const columns: ColumnSpec[] = columnRows.map((row) => ({
        name: row.name,
        type: this.mapSqliteType(row.type),
        nullable: row.notnull === 0,
      }));

      const indexRows = await this.prismaClient.$queryRawUnsafe<SqlitePragmaIndex[]>(
        `PRAGMA index_list("${tableName}")`,
      );

      const indexes: { name: string; fields: string[]; unique: boolean }[] = [];
      for (const idx of indexRows) {
        if (idx.origin === "pk") {
          continue;
        }
        const infoRows = await this.prismaClient.$queryRawUnsafe<SqlitePragmaIndexInfo[]>(
          `PRAGMA index_info("${idx.name}")`,
        );
        const fields = infoRows.sort((a, b) => a.seqno - b.seqno).map((r) => r.name);
        indexes.push({ name: idx.name, fields, unique: idx.unique === 1 });
      }

      tableMap[collectionName] = { columns, indexes };
    }

    return { tables: tableMap };
  }

  private mapSqliteType(sqliteType: string): ColumnSpec["type"] {
    const upper = sqliteType.toUpperCase();
    if (upper === "TEXT") return "text";
    if (upper === "INTEGER") return "integer";
    if (upper === "REAL") return "double";
    if (upper === "BLOB") return "text";
    if (upper === "BOOLEAN") return "boolean";
    if (upper === "BIGINT") return "bigint";
    if (upper === "TIMESTAMPTZ" || upper === "DATETIME") return "timestamptz";
    if (upper === "JSONB") return "jsonb";
    if (upper === "UUID") return "uuid";
    return "text";
  }
}
