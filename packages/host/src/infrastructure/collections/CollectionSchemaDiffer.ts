import type { CollectionDefinition, CollectionFieldDefinition, CollectionIndexDefinition } from "@codemation/core";
import type { ColumnSpec, DiffOps, IndexSpec, LiveCollectionTable } from "./collectionSchemaTypes";

/**
 * Pure logic for diffing declared collection schemas against live database schema.
 * No database access, no DI dependencies — testable in isolation.
 */
export class CollectionSchemaDiffer {
  /**
   * Compute schema differences between a declared collection definition and the live table.
   * Returns the operations needed to bring the live schema in sync with the declared schema.
   */
  diff(declared: CollectionDefinition, live: LiveCollectionTable | undefined): DiffOps {
    if (!live) {
      return {
        collection: declared.name,
        createTable: this.buildColumnsForCreate(declared),
        addColumns: [],
        dropColumns: [],
        addIndexes: declared.indexes.map((idx) => this.buildIndexSpec(declared.name, idx)),
        dropIndexes: [],
      };
    }

    const declaredFields = new Map(Object.entries(declared.fields));
    const liveColumns = new Map(live.columns.map((col) => [col.name, col]));
    const liveIndexes = new Map(live.indexes.map((idx) => [idx.name, idx]));

    const addColumns: ColumnSpec[] = [];
    const dropColumns: string[] = [];
    const addIndexes: IndexSpec[] = [];
    const dropIndexes: string[] = [];

    // Detect new columns
    for (const [fieldName, fieldDef] of declaredFields) {
      if (!liveColumns.has(fieldName)) {
        addColumns.push(this.buildColumnSpec(fieldName, fieldDef));
      }
    }

    // Detect removed columns (auto-fields are always present; skip them)
    const autoFields = new Set(["id", "created_at", "updated_at"]);
    for (const liveCol of live.columns) {
      if (autoFields.has(liveCol.name)) {
        continue;
      }
      if (!declaredFields.has(liveCol.name)) {
        dropColumns.push(liveCol.name);
      }
    }

    // Detect new indexes
    const declaredIndexes = declared.indexes.map((idx) => this.buildIndexSpec(declared.name, idx));
    for (const declIdx of declaredIndexes) {
      if (!liveIndexes.has(declIdx.name)) {
        addIndexes.push(declIdx);
      }
    }

    // Detect removed indexes (only those we generated — name starts with idx_<collection>_)
    const declaredIndexNames = new Set(declaredIndexes.map((i) => i.name));
    for (const liveIdx of live.indexes) {
      if (liveIdx.name.startsWith(`idx_${declared.name}_`) && !declaredIndexNames.has(liveIdx.name)) {
        dropIndexes.push(liveIdx.name);
      }
    }

    return {
      collection: declared.name,
      addColumns,
      dropColumns,
      addIndexes,
      dropIndexes,
    };
  }

  private buildColumnsForCreate(declared: CollectionDefinition): ReadonlyArray<ColumnSpec> {
    const columns: ColumnSpec[] = [{ name: "id", type: "uuid", nullable: false }];
    for (const [fieldName, fieldDef] of Object.entries(declared.fields)) {
      columns.push(this.buildColumnSpec(fieldName, fieldDef));
    }
    columns.push(
      { name: "created_at", type: "timestamptz", nullable: false },
      { name: "updated_at", type: "timestamptz", nullable: false },
    );
    return columns;
  }

  private buildColumnSpec(name: string, def: CollectionFieldDefinition): ColumnSpec {
    return {
      name,
      type: this.mapFieldType(def.type),
      nullable: def.nullable,
      default: def.default,
    };
  }

  private mapFieldType(fieldType: CollectionFieldDefinition["type"]): ColumnSpec["type"] {
    switch (fieldType) {
      case "text":
        return "text";
      case "int":
        return "integer";
      case "bigint":
        return "bigint";
      case "double":
        return "double";
      case "bool":
        return "boolean";
      case "timestamptz":
        return "timestamptz";
      case "jsonb":
        return "jsonb";
      case "uuid":
        return "uuid";
    }
  }

  private buildIndexSpec(collectionName: string, idx: CollectionIndexDefinition): IndexSpec {
    const indexName = `idx_${collectionName}_${idx.on.join("_")}`;
    return {
      name: indexName,
      fields: idx.on as ReadonlyArray<string>,
      unique: idx.unique ?? false,
    };
  }
}
