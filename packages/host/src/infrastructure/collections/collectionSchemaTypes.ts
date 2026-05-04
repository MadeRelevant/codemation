/**
 * Schema types for collections — pure types, no classes, no imports with side effects.
 */

export interface ColumnSpec {
  readonly name: string;
  readonly type: "uuid" | "text" | "integer" | "bigint" | "double" | "boolean" | "timestamptz" | "jsonb";
  readonly nullable: boolean;
  readonly default?: unknown;
}

export interface IndexSpec {
  readonly name: string;
  readonly fields: ReadonlyArray<string>;
  readonly unique: boolean;
}

export interface LiveCollectionTable {
  readonly columns: ReadonlyArray<ColumnSpec>;
  readonly indexes: ReadonlyArray<IndexSpec>;
}

export interface LiveCollectionsSchema {
  readonly tables: Readonly<Record<string, LiveCollectionTable>>;
}

export interface DiffOps {
  readonly collection: string;
  /** Present when the table does not exist and must be created. Contains all columns including auto-fields. */
  readonly createTable?: ReadonlyArray<ColumnSpec>;
  readonly addColumns: ReadonlyArray<ColumnSpec>;
  readonly dropColumns: ReadonlyArray<string>;
  readonly addIndexes: ReadonlyArray<IndexSpec>;
  readonly dropIndexes: ReadonlyArray<string>;
}

export interface CollectionSyncResult {
  readonly planned: ReadonlyArray<DiffOps>;
  readonly applied: ReadonlyArray<DiffOps>;
}
