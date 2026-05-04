import type { CollectionDefinition } from "@codemation/core";
import type { CollectionDdlEmitter } from "./CollectionDdlEmitter.types";
import type { ColumnSpec, IndexSpec } from "./collectionSchemaTypes";

/**
 * Emits SQLite DDL for collection tables.
 * - No schema namespace; tables named "collections_<name>"
 * - id is TEXT PRIMARY KEY (UUID stored as text)
 * - JSONB fields stored as TEXT; dates stored as TEXT (ISO-8601)
 * - Column drops throw an error — SQLite DROP COLUMN has caveats; v1 requires manual migration
 */
export class SqliteCollectionDdlEmitter implements CollectionDdlEmitter {
  createSchemaSql(): null {
    return null;
  }

  createTableSql(definition: CollectionDefinition, columns: ReadonlyArray<ColumnSpec>): string {
    const tableName = this.qualifyTable(definition.name);
    const columnDefs = columns.map((col) => this.columnDef(col)).join(",\n  ");
    return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columnDefs}\n)`;
  }

  addColumnSql(definition: CollectionDefinition, column: ColumnSpec): string {
    const tableName = this.qualifyTable(definition.name);
    const colDef = this.columnDef(column);
    return `ALTER TABLE ${tableName} ADD COLUMN ${colDef}`;
  }

  dropColumnSql(definition: CollectionDefinition, columnName: string): string {
    throw new Error(
      `Collections schema sync cannot automatically drop column "${columnName}" from collection "${definition.name}" in SQLite. ` +
        `SQLite DROP COLUMN support has caveats that make automated dropping unsafe. ` +
        `Please perform a manual migration to remove the column, or file an issue at ` +
        `https://github.com/MadeRelevant/codemation/issues if you need automated support for this.`,
    );
  }

  createIndexSql(definition: CollectionDefinition, index: IndexSpec): string {
    const tableName = this.qualifyTable(definition.name);
    const unique = index.unique ? "UNIQUE " : "";
    const cols = index.fields.map((f) => `"${f}"`).join(", ");
    return `CREATE ${unique}INDEX IF NOT EXISTS "${index.name}" ON ${tableName} (${cols})`;
  }

  dropIndexSql(_definition: CollectionDefinition, indexName: string): string {
    return `DROP INDEX IF EXISTS "${indexName}"`;
  }

  qualifyTable(collectionName: string): string {
    return `"collections_${collectionName}"`;
  }

  private columnDef(col: ColumnSpec): string {
    const sqliteType = this.mapType(col.type);
    const nullConstraint = col.nullable ? "" : " NOT NULL";

    if (col.name === "id") {
      return `"id" TEXT NOT NULL PRIMARY KEY`;
    }
    if (col.name === "created_at" || col.name === "updated_at") {
      return `"${col.name}" TEXT NOT NULL`;
    }

    const defaultClause = col.default !== undefined ? ` DEFAULT ${this.literalDefault(col.default)}` : "";
    return `"${col.name}" ${sqliteType}${nullConstraint}${defaultClause}`;
  }

  private mapType(type: ColumnSpec["type"]): string {
    switch (type) {
      case "uuid":
        return "TEXT";
      case "text":
        return "TEXT";
      case "integer":
        return "INTEGER";
      case "bigint":
        return "INTEGER";
      case "double":
        return "REAL";
      case "boolean":
        return "INTEGER";
      case "timestamptz":
        return "TEXT";
      case "jsonb":
        return "TEXT";
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
