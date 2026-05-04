import { describe, expect, it } from "vitest";
import { CollectionSchemaDiffer } from "../../../src/infrastructure/collections/CollectionSchemaDiffer";
import type { CollectionDefinition } from "@codemation/core";
import type { LiveCollectionTable } from "../../../src/infrastructure/collections/collectionSchemaTypes";

const differ = new CollectionSchemaDiffer();

function makeDefinition(
  name: string,
  fields: Record<string, { type: CollectionDefinition["fields"][string]["type"]; nullable: boolean }>,
  indexes: CollectionDefinition["indexes"] = [],
): CollectionDefinition {
  const fieldDefs: Record<string, CollectionDefinition["fields"][string]> = {};
  for (const [key, value] of Object.entries(fields)) {
    fieldDefs[key] = { type: value.type, nullable: value.nullable };
  }
  return { name, fields: fieldDefs, indexes };
}

function makeTable(
  columns: Array<{
    name: string;
    type: "text" | "integer" | "uuid" | "timestamptz" | "jsonb" | "boolean" | "bigint" | "double";
    nullable: boolean;
  }>,
  indexes: Array<{ name: string; fields: string[]; unique: boolean }> = [],
): LiveCollectionTable {
  return { columns, indexes };
}

describe("CollectionSchemaDiffer", () => {
  describe("create-table path (table does not exist)", () => {
    it("returns createTable with all columns including auto-fields for a new collection", () => {
      const definition = makeDefinition("users", {
        email: { type: "text", nullable: false },
        score: { type: "int", nullable: true },
      });

      const result = differ.diff(definition, undefined);

      expect(result.collection).toBe("users");
      expect(result.createTable).toBeDefined();
      expect(result.addColumns).toHaveLength(0);
      expect(result.dropColumns).toHaveLength(0);

      const colNames = result.createTable!.map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("email");
      expect(colNames).toContain("score");
      expect(colNames).toContain("created_at");
      expect(colNames).toContain("updated_at");
    });

    it("maps CollectionFieldType types correctly in createTable columns", () => {
      const definition = makeDefinition("typed_table", {
        name: { type: "text", nullable: true },
        count: { type: "int", nullable: false },
        amount: { type: "bigint", nullable: false },
        ratio: { type: "double", nullable: true },
        active: { type: "bool", nullable: false },
        happened_at: { type: "timestamptz", nullable: true },
        data: { type: "jsonb", nullable: true },
        ref_id: { type: "uuid", nullable: true },
      });

      const result = differ.diff(definition, undefined);

      const colMap = new Map(result.createTable!.map((c) => [c.name, c]));
      expect(colMap.get("name")?.type).toBe("text");
      expect(colMap.get("count")?.type).toBe("integer");
      expect(colMap.get("amount")?.type).toBe("bigint");
      expect(colMap.get("ratio")?.type).toBe("double");
      expect(colMap.get("active")?.type).toBe("boolean");
      expect(colMap.get("happened_at")?.type).toBe("timestamptz");
      expect(colMap.get("data")?.type).toBe("jsonb");
      expect(colMap.get("ref_id")?.type).toBe("uuid");
    });

    it("includes declared indexes in addIndexes when table is new", () => {
      const definition = makeDefinition("contacts", { email: { type: "text", nullable: false } }, [
        { on: ["email"], unique: true },
      ]);

      const result = differ.diff(definition, undefined);

      expect(result.addIndexes).toHaveLength(1);
      expect(result.addIndexes[0].name).toBe("idx_contacts_email");
      expect(result.addIndexes[0].unique).toBe(true);
    });
  });

  describe("additive changes (table exists)", () => {
    it("returns empty diff when live schema matches declared schema exactly", () => {
      const definition = makeDefinition("items", {
        title: { type: "text", nullable: false },
      });
      const live = makeTable([
        { name: "id", type: "uuid", nullable: false },
        { name: "title", type: "text", nullable: false },
        { name: "created_at", type: "timestamptz", nullable: false },
        { name: "updated_at", type: "timestamptz", nullable: false },
      ]);

      const result = differ.diff(definition, live);

      expect(result.createTable).toBeUndefined();
      expect(result.addColumns).toHaveLength(0);
      expect(result.dropColumns).toHaveLength(0);
      expect(result.addIndexes).toHaveLength(0);
      expect(result.dropIndexes).toHaveLength(0);
    });

    it("returns addColumns for new fields not in live schema", () => {
      const definition = makeDefinition("items", {
        title: { type: "text", nullable: false },
        description: { type: "text", nullable: true },
      });
      const live = makeTable([
        { name: "id", type: "uuid", nullable: false },
        { name: "title", type: "text", nullable: false },
        { name: "created_at", type: "timestamptz", nullable: false },
        { name: "updated_at", type: "timestamptz", nullable: false },
      ]);

      const result = differ.diff(definition, live);

      expect(result.addColumns).toHaveLength(1);
      expect(result.addColumns[0].name).toBe("description");
      expect(result.addColumns[0].nullable).toBe(true);
    });

    it("returns addIndexes for declared indexes not in live schema", () => {
      const definition = makeDefinition("orders", { status: { type: "text", nullable: false } }, [
        { on: ["status"], unique: false },
      ]);
      const live = makeTable([
        { name: "id", type: "uuid", nullable: false },
        { name: "status", type: "text", nullable: false },
        { name: "created_at", type: "timestamptz", nullable: false },
        { name: "updated_at", type: "timestamptz", nullable: false },
      ]);

      const result = differ.diff(definition, live);

      expect(result.addIndexes).toHaveLength(1);
      expect(result.addIndexes[0].name).toBe("idx_orders_status");
    });
  });

  describe("destructive changes (table exists)", () => {
    it("returns dropColumns for fields present in live but not in declared", () => {
      const definition = makeDefinition("items", {
        title: { type: "text", nullable: false },
      });
      const live = makeTable([
        { name: "id", type: "uuid", nullable: false },
        { name: "title", type: "text", nullable: false },
        { name: "legacy_field", type: "text", nullable: true },
        { name: "created_at", type: "timestamptz", nullable: false },
        { name: "updated_at", type: "timestamptz", nullable: false },
      ]);

      const result = differ.diff(definition, live);

      expect(result.dropColumns).toContain("legacy_field");
    });

    it("returns dropIndexes for managed indexes no longer declared", () => {
      const definition = makeDefinition("orders", { status: { type: "text", nullable: false } }, []);
      const live = makeTable(
        [
          { name: "id", type: "uuid", nullable: false },
          { name: "status", type: "text", nullable: false },
          { name: "created_at", type: "timestamptz", nullable: false },
          { name: "updated_at", type: "timestamptz", nullable: false },
        ],
        [{ name: "idx_orders_status", fields: ["status"], unique: false }],
      );

      const result = differ.diff(definition, live);

      expect(result.dropIndexes).toContain("idx_orders_status");
    });

    it("does not report auto-fields (id, created_at, updated_at) as dropped columns", () => {
      const definition = makeDefinition("items", {
        title: { type: "text", nullable: false },
      });
      const live = makeTable([
        { name: "id", type: "uuid", nullable: false },
        { name: "title", type: "text", nullable: false },
        { name: "created_at", type: "timestamptz", nullable: false },
        { name: "updated_at", type: "timestamptz", nullable: false },
      ]);

      const result = differ.diff(definition, live);

      expect(result.dropColumns).not.toContain("id");
      expect(result.dropColumns).not.toContain("created_at");
      expect(result.dropColumns).not.toContain("updated_at");
    });

    it("does not drop externally-created indexes that don't match the managed prefix", () => {
      const definition = makeDefinition("orders", { status: { type: "text", nullable: false } }, []);
      const live = makeTable(
        [
          { name: "id", type: "uuid", nullable: false },
          { name: "status", type: "text", nullable: false },
          { name: "created_at", type: "timestamptz", nullable: false },
          { name: "updated_at", type: "timestamptz", nullable: false },
        ],
        [{ name: "custom_idx_status", fields: ["status"], unique: false }],
      );

      const result = differ.diff(definition, live);

      expect(result.dropIndexes).not.toContain("custom_idx_status");
    });
  });

  describe("noop cases", () => {
    it("returns no changes when collection has no declared fields and table exists with only auto-fields", () => {
      const definition = makeDefinition("events", {});
      const live = makeTable([
        { name: "id", type: "uuid", nullable: false },
        { name: "created_at", type: "timestamptz", nullable: false },
        { name: "updated_at", type: "timestamptz", nullable: false },
      ]);

      const result = differ.diff(definition, live);

      expect(result.createTable).toBeUndefined();
      expect(result.addColumns).toHaveLength(0);
      expect(result.dropColumns).toHaveLength(0);
      expect(result.addIndexes).toHaveLength(0);
      expect(result.dropIndexes).toHaveLength(0);
    });
  });
});
