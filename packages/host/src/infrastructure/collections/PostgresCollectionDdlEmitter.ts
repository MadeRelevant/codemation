import type { CollectionDefinition } from "@codemation/core";
import type { CollectionDdlEmitter } from "./CollectionDdlEmitter.types";
import type { ColumnSpec, IndexSpec } from "./collectionSchemaTypes";

/**
 * Emits Postgres DDL for collection tables.
 * - Schema: "collections" (created if not exists, with pgcrypto extension for UUID generation)
 * - Table names: "collections"."<name>"
 * - UUID primary key: id DEFAULT gen_random_uuid()
 * - Timestamps: TIMESTAMPTZ NOT NULL
 * - All identifiers double-quoted
 */
export class PostgresCollectionDdlEmitter implements CollectionDdlEmitter {
  createSchemaSql(): string {
    return ['CREATE EXTENSION IF NOT EXISTS "pgcrypto"', 'CREATE SCHEMA IF NOT EXISTS "collections"'].join(";\n") + ";";
  }

  createTableSql(definition: CollectionDefinition, columns: ReadonlyArray<ColumnSpec>): string {
    const tableName = this.qualifyTable(definition.name);
    const columnDefs = columns.map((col) => this.columnDef(col)).join(",\n  ");
    return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columnDefs}\n)`;
  }

  addColumnSql(definition: CollectionDefinition, column: ColumnSpec): string {
    const tableName = this.qualifyTable(definition.name);
    const colDef = this.columnDef(column);
    return `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${colDef}`;
  }

  dropColumnSql(definition: CollectionDefinition, columnName: string): string {
    const tableName = this.qualifyTable(definition.name);
    return `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS "${columnName}"`;
  }

  createIndexSql(definition: CollectionDefinition, index: IndexSpec): string {
    const tableName = this.qualifyTable(definition.name);
    const unique = index.unique ? "UNIQUE " : "";
    const cols = index.fields.map((f) => `"${f}"`).join(", ");
    return `CREATE ${unique}INDEX IF NOT EXISTS "${index.name}" ON ${tableName} (${cols})`;
  }

  dropIndexSql(_definition: CollectionDefinition, indexName: string): string {
    return `DROP INDEX IF EXISTS "collections"."${indexName}"`;
  }

  qualifyTable(collectionName: string): string {
    return `"collections"."${collectionName}"`;
  }

  private columnDef(col: ColumnSpec): string {
    const pgType = this.mapType(col);
    const nullConstraint = col.nullable ? "" : " NOT NULL";

    if (col.name === "id") {
      return `"id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()`;
    }
    if (col.name === "created_at" || col.name === "updated_at") {
      return `"${col.name}" TIMESTAMPTZ NOT NULL`;
    }

    const defaultClause = col.default !== undefined ? ` DEFAULT ${this.literalDefault(col.default)}` : "";
    return `"${col.name}" ${pgType}${nullConstraint}${defaultClause}`;
  }

  private mapType(col: ColumnSpec): string {
    switch (col.type) {
      case "uuid":
        return "UUID";
      case "text":
        return "TEXT";
      case "integer":
        return "INTEGER";
      case "bigint":
        return "BIGINT";
      case "double":
        return "DOUBLE PRECISION";
      case "boolean":
        return "BOOLEAN";
      case "timestamptz":
        return "TIMESTAMPTZ";
      case "jsonb":
        return "JSONB";
    }
  }

  private literalDefault(value: unknown): string {
    if (typeof value === "string") {
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return "NULL";
  }
}
