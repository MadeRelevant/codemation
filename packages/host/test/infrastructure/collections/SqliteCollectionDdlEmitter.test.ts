import { describe, expect, it } from "vitest";
import type { CollectionDefinition } from "@codemation/core";
import { SqliteCollectionDdlEmitter } from "../../../src/infrastructure/collections/SqliteCollectionDdlEmitter";
import type { ColumnSpec, IndexSpec } from "../../../src/infrastructure/collections/collectionSchemaTypes";

const emitter = new SqliteCollectionDdlEmitter();

function makeDefinition(name: string): CollectionDefinition {
  return { name, fields: {}, indexes: [] };
}

describe("SqliteCollectionDdlEmitter", () => {
  describe("createSchemaSql", () => {
    it("returns null (SQLite has no schema namespaces)", () => {
      expect(emitter.createSchemaSql()).toBeNull();
    });
  });

  describe("qualifyTable", () => {
    it("prefixes the table name with collections_", () => {
      expect(emitter.qualifyTable("users")).toBe('"collections_users"');
    });
  });

  describe("createTableSql", () => {
    it("generates a CREATE TABLE IF NOT EXISTS for a simple text column", () => {
      const col: ColumnSpec = { name: "email", type: "text", nullable: false };
      const sql = emitter.createTableSql(makeDefinition("users"), [col]);
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
      expect(sql).toContain('"collections_users"');
      expect(sql).toContain('"email" TEXT NOT NULL');
    });

    it("generates a NOT NULL TEXT PRIMARY KEY for the id column", () => {
      const col: ColumnSpec = { name: "id", type: "uuid", nullable: false };
      const sql = emitter.createTableSql(makeDefinition("items"), [col]);
      expect(sql).toContain('"id" TEXT NOT NULL PRIMARY KEY');
    });

    it("generates TEXT NOT NULL for created_at", () => {
      const col: ColumnSpec = { name: "created_at", type: "timestamptz", nullable: true };
      const sql = emitter.createTableSql(makeDefinition("items"), [col]);
      expect(sql).toContain('"created_at" TEXT NOT NULL');
    });

    it("generates TEXT NOT NULL for updated_at", () => {
      const col: ColumnSpec = { name: "updated_at", type: "timestamptz", nullable: true };
      const sql = emitter.createTableSql(makeDefinition("items"), [col]);
      expect(sql).toContain('"updated_at" TEXT NOT NULL');
    });

    it("generates nullable column without NOT NULL", () => {
      const col: ColumnSpec = { name: "score", type: "integer", nullable: true };
      const sql = emitter.createTableSql(makeDefinition("items"), [col]);
      expect(sql).toContain('"score" INTEGER');
      expect(sql).not.toContain("NOT NULL");
    });

    it("generates DEFAULT clause for a column with a default value", () => {
      const col: ColumnSpec = { name: "active", type: "boolean", nullable: false, default: true };
      const sql = emitter.createTableSql(makeDefinition("items"), [col]);
      expect(sql).toContain("DEFAULT true");
    });

    it("generates DEFAULT clause with quoted string for string default", () => {
      const col: ColumnSpec = { name: "status", type: "text", nullable: false, default: "pending" };
      const sql = emitter.createTableSql(makeDefinition("items"), [col]);
      expect(sql).toContain("DEFAULT 'pending'");
    });

    it("generates all SQLite type mappings", () => {
      const types: Array<[ColumnSpec["type"], string]> = [
        ["uuid", "TEXT"],
        ["text", "TEXT"],
        ["integer", "INTEGER"],
        ["bigint", "INTEGER"],
        ["double", "REAL"],
        ["boolean", "INTEGER"],
        ["timestamptz", "TEXT"],
        ["jsonb", "TEXT"],
      ];
      for (const [type, expected] of types) {
        const col: ColumnSpec = { name: "field", type, nullable: true };
        const sql = emitter.createTableSql(makeDefinition("t"), [col]);
        expect(sql).toContain(expected);
      }
    });
  });

  describe("addColumnSql", () => {
    it("emits ALTER TABLE ADD COLUMN", () => {
      const col: ColumnSpec = { name: "description", type: "text", nullable: true };
      const sql = emitter.addColumnSql(makeDefinition("items"), col);
      expect(sql).toBe(`ALTER TABLE "collections_items" ADD COLUMN "description" TEXT`);
    });
  });

  describe("dropColumnSql", () => {
    it("throws an informative error because SQLite column drops are unsafe", () => {
      expect(() => emitter.dropColumnSql(makeDefinition("items"), "old_col")).toThrow(
        /cannot automatically drop column "old_col"/,
      );
    });
  });

  describe("createIndexSql", () => {
    it("emits CREATE INDEX IF NOT EXISTS for a non-unique index", () => {
      const index: IndexSpec = { name: "idx_items_status", fields: ["status"], unique: false };
      const sql = emitter.createIndexSql(makeDefinition("items"), index);
      expect(sql).toBe(`CREATE INDEX IF NOT EXISTS "idx_items_status" ON "collections_items" ("status")`);
    });

    it("emits CREATE UNIQUE INDEX IF NOT EXISTS for a unique index", () => {
      const index: IndexSpec = { name: "idx_items_email_unique", fields: ["email"], unique: true };
      const sql = emitter.createIndexSql(makeDefinition("items"), index);
      expect(sql).toContain("UNIQUE INDEX IF NOT EXISTS");
    });

    it("emits multi-column index with all fields", () => {
      const index: IndexSpec = { name: "idx_compound", fields: ["a", "b"], unique: false };
      const sql = emitter.createIndexSql(makeDefinition("t"), index);
      expect(sql).toContain(`("a", "b")`);
    });
  });

  describe("dropIndexSql", () => {
    it("emits DROP INDEX IF EXISTS", () => {
      const sql = emitter.dropIndexSql(makeDefinition("items"), "idx_items_status");
      expect(sql).toBe(`DROP INDEX IF EXISTS "idx_items_status"`);
    });
  });
});
