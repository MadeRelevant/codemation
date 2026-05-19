/**
 * Behavioral tests for CollectionSchemaSyncer.
 * Tests the destructive-change block, dryRun mode, lock delegation, and happy path.
 * Uses minimal stubs — no real DB required.
 */
import { describe, expect, it } from "vitest";
import { CollectionSchemaSyncer } from "../../../src/infrastructure/collections/CollectionSchemaSyncer";
import type { DiffOps } from "../../../src/infrastructure/collections/collectionSchemaTypes";

function makeLogger() {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
}

function makeLockService(exec: (fn: () => Promise<unknown>) => Promise<unknown> = (fn) => fn()) {
  return {
    withLock: (_name: string, fn: () => Promise<unknown>) => exec(fn),
  };
}

function makePrisma(executeResult: unknown = 0) {
  return {
    $executeRawUnsafe: async () => executeResult,
  };
}

function makeIntrospector(tables: Record<string, unknown> = {}) {
  return { introspect: async () => ({ tables }) };
}

function makeDdlEmitter(opts: { createSchemaSql?: string | null } = {}) {
  return {
    createSchemaSql: () => opts.createSchemaSql ?? null,
    createTableSql: () => "CREATE TABLE ...",
    addColumnSql: () => "ALTER TABLE ...",
    dropColumnSql: () => "ALTER TABLE ... DROP ...",
    createIndexSql: () => "CREATE INDEX ...",
    dropIndexSql: () => "DROP INDEX ...",
  };
}

function makeRegistry(collections: object[] = []) {
  return {
    list: () => collections,
    resolve: (name: string) => collections.find((c: unknown) => (c as { name: string }).name === name),
  };
}

function makeDiffer(result: DiffOps) {
  return { diff: () => result };
}

const NO_CHANGES: DiffOps = {
  collection: "items",
  addColumns: [],
  dropColumns: [],
  addIndexes: [],
  dropIndexes: [],
};

const CREATE_TABLE_OPS: DiffOps = {
  collection: "items",
  createTable: [{ name: "id", type: "uuid", nullable: false }],
  addColumns: [],
  dropColumns: [],
  addIndexes: [],
  dropIndexes: [],
};

const DESTRUCTIVE_OPS: DiffOps = {
  collection: "items",
  addColumns: [],
  dropColumns: ["old_col"],
  addIndexes: [],
  dropIndexes: ["old_idx"],
};

describe("CollectionSchemaSyncer.sync", () => {
  it("returns empty planned/applied when no diffs", async () => {
    const collection = { name: "items", fields: {}, indexes: [] };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([collection]) as never,
      makeIntrospector({ items: { columns: [], indexes: [] } }) as never,
      makeDiffer(NO_CHANGES) as never,
      makeDdlEmitter() as never,
      makeLockService() as never,
      makePrisma() as never,
      makeLogger() as never,
      {},
    );
    const result = await syncer.sync();
    expect(result.planned).toHaveLength(0);
    expect(result.applied).toHaveLength(0);
  });

  it("executes createSchemaSql when ddlEmitter returns a SQL string", async () => {
    const execCalls: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string) => {
        execCalls.push(sql);
        return 0;
      },
    };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([]) as never,
      makeIntrospector() as never,
      makeDiffer(NO_CHANGES) as never,
      makeDdlEmitter({ createSchemaSql: "CREATE SCHEMA IF NOT EXISTS collections" }) as never,
      makeLockService() as never,
      prisma as never,
      makeLogger() as never,
      {},
    );
    await syncer.sync();
    expect(execCalls).toContain("CREATE SCHEMA IF NOT EXISTS collections");
  });

  it("does not execute createSchemaSql when emitter returns null", async () => {
    const execCalls: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string) => {
        execCalls.push(sql);
        return 0;
      },
    };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([]) as never,
      makeIntrospector() as never,
      makeDiffer(NO_CHANGES) as never,
      makeDdlEmitter({ createSchemaSql: null }) as never,
      makeLockService() as never,
      prisma as never,
      makeLogger() as never,
      {},
    );
    await syncer.sync();
    expect(execCalls).toHaveLength(0);
  });

  it("throws when destructive ops detected and CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE not set", async () => {
    const collection = { name: "items", fields: {}, indexes: [] };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([collection]) as never,
      makeIntrospector({ items: { columns: [{ name: "old_col" }], indexes: [{ name: "old_idx" }] } }) as never,
      makeDiffer(DESTRUCTIVE_OPS) as never,
      makeDdlEmitter() as never,
      makeLockService() as never,
      makePrisma() as never,
      makeLogger() as never,
      {}, // No CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE
    );
    await expect(syncer.sync()).rejects.toThrow(/drop data/);
    await expect(syncer.sync()).rejects.toThrow(/CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE/);
  });

  it("allows destructive ops when CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE=1", async () => {
    const collection = { name: "items", fields: { new_col: { type: "text", nullable: true } }, indexes: [] };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([collection]) as never,
      makeIntrospector({ items: { columns: [{ name: "old_col" }], indexes: [] } }) as never,
      makeDiffer(DESTRUCTIVE_OPS) as never,
      makeDdlEmitter() as never,
      makeLockService() as never,
      makePrisma() as never,
      makeLogger() as never,
      { CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE: "1" },
    );
    const result = await syncer.sync();
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].collection).toBe("items");
  });

  it("dryRun returns planned diffs but does not apply them", async () => {
    const execCalls: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string) => {
        execCalls.push(sql);
        return 0;
      },
    };
    const collection = { name: "items", fields: {}, indexes: [] };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([collection]) as never,
      makeIntrospector({}) as never,
      makeDiffer(CREATE_TABLE_OPS) as never,
      makeDdlEmitter() as never,
      makeLockService() as never,
      prisma as never,
      makeLogger() as never,
      {},
    );
    const result = await syncer.sync({ dryRun: true });
    expect(result.planned).toHaveLength(1);
    expect(result.applied).toHaveLength(0);
    // No DDL should have been executed
    expect(execCalls).toHaveLength(0);
  });

  it("applies createTable ops (new collection)", async () => {
    const execCalls: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string) => {
        execCalls.push(sql);
        return 0;
      },
    };
    const collection = { name: "items", fields: {}, indexes: [] };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([collection]) as never,
      makeIntrospector({}) as never, // table doesn't exist yet
      makeDiffer(CREATE_TABLE_OPS) as never,
      makeDdlEmitter() as never,
      makeLockService() as never,
      prisma as never,
      makeLogger() as never,
      {},
    );
    const result = await syncer.sync();
    expect(result.applied).toHaveLength(1);
    expect(execCalls.some((sql) => sql.includes("CREATE TABLE"))).toBe(true);
  });

  it("applies addColumns ops", async () => {
    const execCalls: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string) => {
        execCalls.push(sql);
        return 0;
      },
    };
    const collection = { name: "items", fields: {}, indexes: [] };
    const addColOps: DiffOps = {
      collection: "items",
      addColumns: [{ name: "new_col", type: "text", nullable: true }],
      dropColumns: [],
      addIndexes: [],
      dropIndexes: [],
    };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([collection]) as never,
      makeIntrospector({ items: { columns: [], indexes: [] } }) as never,
      makeDiffer(addColOps) as never,
      makeDdlEmitter() as never,
      makeLockService() as never,
      prisma as never,
      makeLogger() as never,
      {},
    );
    const result = await syncer.sync();
    expect(result.applied).toHaveLength(1);
    expect(execCalls.some((sql) => sql.includes("ALTER TABLE"))).toBe(true);
  });

  it("applies addIndexes ops", async () => {
    const execCalls: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string) => {
        execCalls.push(sql);
        return 0;
      },
    };
    const collection = { name: "items", fields: {}, indexes: [] };
    const addIdxOps: DiffOps = {
      collection: "items",
      addColumns: [],
      dropColumns: [],
      addIndexes: [{ name: "idx_items_name", fields: ["name"], unique: false }],
      dropIndexes: [],
    };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([collection]) as never,
      makeIntrospector({ items: { columns: [], indexes: [] } }) as never,
      makeDiffer(addIdxOps) as never,
      makeDdlEmitter() as never,
      makeLockService() as never,
      prisma as never,
      makeLogger() as never,
      {},
    );
    const result = await syncer.sync();
    expect(result.applied).toHaveLength(1);
    expect(execCalls.some((sql) => sql.includes("CREATE INDEX"))).toBe(true);
  });

  it("throws when collection not found in registry during applyOps", async () => {
    // Registry returns undefined for the collection name
    const emptyRegistry = { list: () => [{ name: "items", fields: {}, indexes: [] }], resolve: () => undefined };
    const syncer = new CollectionSchemaSyncer(
      emptyRegistry as never,
      makeIntrospector({}) as never,
      makeDiffer(CREATE_TABLE_OPS) as never,
      makeDdlEmitter() as never,
      makeLockService() as never,
      makePrisma() as never,
      makeLogger() as never,
      {},
    );
    await expect(syncer.sync()).rejects.toThrow(/not found in registry/);
  });

  it("delegates to lockService.withLock", async () => {
    let lockAcquired = false;
    const lockService = {
      withLock: (_name: string, fn: () => Promise<unknown>) => {
        lockAcquired = true;
        return fn();
      },
    };
    const syncer = new CollectionSchemaSyncer(
      makeRegistry([]) as never,
      makeIntrospector() as never,
      makeDiffer(NO_CHANGES) as never,
      makeDdlEmitter() as never,
      lockService as never,
      makePrisma() as never,
      makeLogger() as never,
      {},
    );
    await syncer.sync();
    expect(lockAcquired).toBe(true);
  });
});
