import type { CollectionSchemaIntrospector } from "./CollectionSchemaIntrospector.types";
import type { ColumnSpec, LiveCollectionTable, LiveCollectionsSchema } from "./collectionSchemaTypes";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";

type PgColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
};

type PgIndex = {
  table_name: string;
  index_name: string;
  column_names: string;
  is_unique: boolean;
};

/**
 * Introspects the live Postgres "collections" schema by querying information_schema.columns and pg_indexes.
 */
export class PostgresCollectionSchemaIntrospector implements CollectionSchemaIntrospector {
  constructor(private readonly prismaClient: PrismaDatabaseClient) {}

  async introspect(): Promise<LiveCollectionsSchema> {
    const columns = await this.prismaClient.$queryRaw<PgColumn[]>`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'collections'
      ORDER BY table_name, ordinal_position
    `;

    const indexes = await this.prismaClient.$queryRaw<PgIndex[]>`
      SELECT
        t.relname AS table_name,
        i.relname AS index_name,
        string_agg(a.attname, ',' ORDER BY ix.indkey_pos) AS column_names,
        ix.indisunique AS is_unique
      FROM
        pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS u(attnum, indkey_pos) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = u.attnum
      WHERE n.nspname = 'collections'
        AND NOT ix.indisprimary
      GROUP BY t.relname, i.relname, ix.indisunique
      ORDER BY t.relname, i.relname
    `;

    const tableMap: Record<string, LiveCollectionTable> = {};

    for (const col of columns) {
      const table = tableMap[col.table_name] ?? { columns: [], indexes: [] };
      (table.columns as ColumnSpec[]).push({
        name: col.column_name,
        type: this.mapPgType(col.data_type),
        nullable: col.is_nullable === "YES",
      });
      tableMap[col.table_name] = table;
    }

    for (const idx of indexes) {
      const table = tableMap[idx.table_name];
      if (!table) {
        continue;
      }
      (table.indexes as unknown as { name: string; fields: string[]; unique: boolean }[]).push({
        name: idx.index_name,
        fields: idx.column_names.split(","),
        unique: idx.is_unique,
      });
    }

    return { tables: tableMap };
  }

  private mapPgType(pgType: string): ColumnSpec["type"] {
    switch (pgType) {
      case "uuid":
        return "uuid";
      case "text":
      case "character varying":
        return "text";
      case "integer":
      case "int4":
      case "int":
        return "integer";
      case "bigint":
      case "int8":
        return "bigint";
      case "double precision":
      case "float8":
        return "double";
      case "boolean":
      case "bool":
        return "boolean";
      case "timestamp with time zone":
      case "timestamptz":
        return "timestamptz";
      case "jsonb":
        return "jsonb";
      default:
        return "text";
    }
  }
}
