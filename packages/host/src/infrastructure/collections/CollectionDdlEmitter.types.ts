import type { CollectionDefinition } from "@codemation/core";
import type { ColumnSpec, IndexSpec } from "./collectionSchemaTypes";

/**
 * Generates SQL DDL for creating and modifying collection tables.
 * Driver-specific implementations handle quoting, type mapping, and extensions.
 */
export interface CollectionDdlEmitter {
  /**
   * Generate SQL to create the collections schema (Postgres only).
   * Returns null for SQLite (uses table name prefixes instead).
   */
  createSchemaSql(): string | null;

  /**
   * Generate SQL to create a new collection table with auto fields (id, created_at, updated_at).
   */
  createTableSql(definition: CollectionDefinition, columns: ReadonlyArray<ColumnSpec>): string;

  /**
   * Generate SQL to add a column to an existing table.
   */
  addColumnSql(definition: CollectionDefinition, column: ColumnSpec): string;

  /**
   * Generate SQL to drop a column from a table.
   * SQLite driver throws a clear error directing the user to a manual migration.
   */
  dropColumnSql(definition: CollectionDefinition, columnName: string): string;

  /**
   * Generate SQL to create an index on a collection table.
   */
  createIndexSql(definition: CollectionDefinition, index: IndexSpec): string;

  /**
   * Generate SQL to drop an index.
   */
  dropIndexSql(definition: CollectionDefinition, indexName: string): string;

  /**
   * Get the qualified table reference for a collection.
   * Postgres: "collections"."name", SQLite: "collections_name"
   */
  qualifyTable(collectionName: string): string;
}
