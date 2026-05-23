/**
 * Behavioral tests for PostgresCollectionDdlEmitter.
 * Pure logic — no database required.
 */
import { describe, expect, it } from "vitest";
import { PostgresCollectionDdlEmitter } from "../../../src/infrastructure/collections/PostgresCollectionDdlEmitter";
import type { CollectionDefinition } from "@codemation/core";

const emitter = new PostgresCollectionDdlEmitter();

const SIMPLE_DEF: CollectionDefinition = {
  name: "items",
  fields: {
    name: { type: "text", nullable: false },
    count: { type: "int", nullable: true },
  },
  indexes: [],
};

describe("PostgresCollectionDdlEmitter.createSchemaSql", () => {
  it("returns CREATE EXTENSION and CREATE SCHEMA statements", () => {
    const sql = emitter.createSchemaSql();
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS");
    expect(sql).toContain("pgcrypto");
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "collections"');
  });
});

describe("PostgresCollectionDdlEmitter.createTableSql", () => {
  it("generates CREATE TABLE with all column defs", () => {
    const columns = [
      { name: "id", type: "uuid" as const, nullable: false },
      { name: "created_at", type: "timestamptz" as const, nullable: false },
      { name: "updated_at", type: "timestamptz" as const, nullable: false },
      { name: "name", type: "text" as const, nullable: false },
    ];
    const sql = emitter.createTableSql(SIMPLE_DEF, columns);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "collections"."items"');
    expect(sql).toContain('"id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(sql).toContain('"created_at" TIMESTAMPTZ NOT NULL');
    expect(sql).toContain('"updated_at" TIMESTAMPTZ NOT NULL');
    expect(sql).toContain('"name" TEXT NOT NULL');
  });

  it("handles nullable text column", () => {
    const columns = [{ name: "notes", type: "text" as const, nullable: true }];
    const sql = emitter.createTableSql(SIMPLE_DEF, columns);
    expect(sql).toContain('"notes" TEXT');
    expect(sql).not.toContain('"notes" TEXT NOT NULL');
  });

  it("handles all column types", () => {
    const types = ["uuid", "text", "integer", "bigint", "double", "boolean", "timestamptz", "jsonb"] as const;
    const pgExpected = ["UUID", "TEXT", "INTEGER", "BIGINT", "DOUBLE PRECISION", "BOOLEAN", "TIMESTAMPTZ", "JSONB"];
    for (const [i, type] of types.entries()) {
      const columns = [{ name: "col", type, nullable: true }];
      const sql = emitter.createTableSql(SIMPLE_DEF, columns);
      expect(sql).toContain(pgExpected[i]);
    }
  });

  it("includes DEFAULT for columns with default value", () => {
    const columns = [{ name: "status", type: "text" as const, nullable: false, default: "active" }];
    const sql = emitter.createTableSql(SIMPLE_DEF, columns);
    expect(sql).toContain("DEFAULT 'active'");
  });

  it("includes DEFAULT for numeric default value", () => {
    const columns = [{ name: "count", type: "integer" as const, nullable: false, default: 0 }];
    const sql = emitter.createTableSql(SIMPLE_DEF, columns);
    expect(sql).toContain("DEFAULT 0");
  });

  it("includes DEFAULT for boolean default value", () => {
    const columns = [{ name: "active", type: "boolean" as const, nullable: false, default: true }];
    const sql = emitter.createTableSql(SIMPLE_DEF, columns);
    expect(sql).toContain("DEFAULT true");
  });

  it("uses NULL for unknown default type", () => {
    const columns = [{ name: "data", type: "jsonb" as const, nullable: true, default: null }];
    const sql = emitter.createTableSql(SIMPLE_DEF, columns);
    expect(sql).toContain("DEFAULT NULL");
  });

  it("escapes single quotes in string default values", () => {
    const columns = [{ name: "label", type: "text" as const, nullable: false, default: "it's a test" }];
    const sql = emitter.createTableSql(SIMPLE_DEF, columns);
    expect(sql).toContain("DEFAULT 'it''s a test'");
  });
});

describe("PostgresCollectionDdlEmitter.addColumnSql", () => {
  it("generates ADD COLUMN statement", () => {
    const column = { name: "email", type: "text" as const, nullable: false };
    const sql = emitter.addColumnSql(SIMPLE_DEF, column);
    expect(sql).toContain('ALTER TABLE "collections"."items"');
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS");
    expect(sql).toContain('"email" TEXT NOT NULL');
  });

  it("generates ADD COLUMN for nullable column", () => {
    const column = { name: "notes", type: "text" as const, nullable: true };
    const sql = emitter.addColumnSql(SIMPLE_DEF, column);
    expect(sql).not.toContain("NOT NULL");
  });
});

describe("PostgresCollectionDdlEmitter.dropColumnSql", () => {
  it("generates DROP COLUMN statement", () => {
    const sql = emitter.dropColumnSql(SIMPLE_DEF, "old_column");
    expect(sql).toContain('ALTER TABLE "collections"."items"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "old_column"');
  });
});

describe("PostgresCollectionDdlEmitter.createIndexSql", () => {
  it("generates non-unique CREATE INDEX statement", () => {
    const index = { name: "idx_items_name", fields: ["name"], unique: false };
    const sql = emitter.createIndexSql(SIMPLE_DEF, index);
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "idx_items_name"');
    expect(sql).toContain('"collections"."items"');
    expect(sql).toContain('"name"');
    expect(sql).not.toContain("UNIQUE");
  });

  it("generates UNIQUE CREATE INDEX statement", () => {
    const index = { name: "idx_items_email_unique", fields: ["email"], unique: true };
    const sql = emitter.createIndexSql(SIMPLE_DEF, index);
    expect(sql).toContain("CREATE UNIQUE INDEX");
  });

  it("generates composite index with multiple fields", () => {
    const index = { name: "idx_items_multi", fields: ["name", "count"], unique: false };
    const sql = emitter.createIndexSql(SIMPLE_DEF, index);
    expect(sql).toContain('"name", "count"');
  });
});

describe("PostgresCollectionDdlEmitter.dropIndexSql", () => {
  it("generates DROP INDEX statement", () => {
    const sql = emitter.dropIndexSql(SIMPLE_DEF, "idx_items_old");
    expect(sql).toContain('DROP INDEX IF EXISTS "collections"."idx_items_old"');
  });
});

describe("PostgresCollectionDdlEmitter.qualifyTable", () => {
  it("returns qualified table name", () => {
    expect(emitter.qualifyTable("users")).toBe('"collections"."users"');
  });
});
