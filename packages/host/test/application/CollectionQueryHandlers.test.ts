/**
 * Happy-path tests for collection application query/command handlers.
 * Extends the error-path coverage in miscCoverage.test.ts.
 */
import { describe, expect, it } from "vitest";
import { ListCollectionRowsQueryHandler } from "../../src/application/collections/ListCollectionRowsQueryHandler";
import { ListCollectionRowsQuery } from "../../src/application/collections/ListCollectionRowsQuery";
import { ListCollectionsQueryHandler } from "../../src/application/collections/ListCollectionsQueryHandler";
import { ListCollectionsQuery } from "../../src/application/collections/ListCollectionsQuery";
import { CollectionRegistry } from "../../src/infrastructure/collections/CollectionRegistry";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCollectionRegistry(names: string[]) {
  return {
    has: (name: string) => names.includes(name),
    list: () => names.map((name) => ({ name, fields: {}, indexes: [] })),
    resolve: (name: string) => (names.includes(name) ? { name, fields: {}, indexes: [] } : undefined),
  };
}

function makeRow(id: string) {
  return {
    id,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-02T00:00:00Z"),
    value: "data",
  };
}

// ── ListCollectionRowsQueryHandler ────────────────────────────────────────────

describe("ListCollectionRowsQueryHandler — happy path", () => {
  it("returns mapped rows with ISO date strings", async () => {
    const row = makeRow("row-1");
    const store = {
      list: async () => ({ rows: [row], total: 1 }),
    };
    const storeRegistry = {
      get: (_name: string) => store,
    };
    const handler = new ListCollectionRowsQueryHandler(
      makeCollectionRegistry(["items"]) as never,
      storeRegistry as never,
    );
    const result = await handler.execute(new ListCollectionRowsQuery("items", 10, 0));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("row-1");
    expect(result.rows[0].created_at).toBe("2024-01-01T00:00:00.000Z");
    expect(result.rows[0].updated_at).toBe("2024-01-02T00:00:00.000Z");
    expect(result.rows[0].data).toEqual({ value: "data" });
    expect(result.total).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);
  });

  it("passes where filter to store.list", async () => {
    let capturedWhere: unknown;
    const store = {
      list: async (args: { where?: unknown }) => {
        capturedWhere = args.where;
        return { rows: [], total: 0 };
      },
    };
    const storeRegistry = { get: () => store };
    const handler = new ListCollectionRowsQueryHandler(
      makeCollectionRegistry(["items"]) as never,
      storeRegistry as never,
    );
    await handler.execute(new ListCollectionRowsQuery("items", 5, 10, { status: "active" }));
    expect(capturedWhere).toEqual({ status: "active" });
  });

  it("converts non-Date created_at to string", async () => {
    const store = {
      list: async () => ({
        rows: [
          { id: "row-2", created_at: "2024-03-01" as unknown as Date, updated_at: "2024-03-02" as unknown as Date },
        ],
        total: 1,
      }),
    };
    const storeRegistry = { get: () => store };
    const handler = new ListCollectionRowsQueryHandler(
      makeCollectionRegistry(["items"]) as never,
      storeRegistry as never,
    );
    const result = await handler.execute(new ListCollectionRowsQuery("items", 10, 0));
    expect(result.rows[0].created_at).toBe("2024-03-01");
  });
});

// ── ListCollectionsQueryHandler ──────────────────────────────────────────────

describe("ListCollectionsQueryHandler — happy path", () => {
  it("returns summary with rowCount from store", async () => {
    const store = { list: async () => ({ rows: [], total: 42 }) };
    const storeRegistry = { get: (_name: string) => store };
    const registry = makeCollectionRegistry(["users"]);
    // Add fields to the definition
    const registryWithFields = {
      ...registry,
      list: () => [{ name: "users", fields: { email: {}, name: {} }, indexes: [] }],
    };
    const handler = new ListCollectionsQueryHandler(registryWithFields as never, storeRegistry as never);
    const result = await handler.execute(new ListCollectionsQuery());
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("users");
    expect(result[0].fieldCount).toBe(2);
    expect(result[0].rowCount).toBe(42);
  });

  it("returns rowCount=0 when store not available", async () => {
    const storeRegistry = { get: (_name: string) => undefined };
    const registryWithFields = {
      list: () => [{ name: "orders", fields: { id: {} }, indexes: [] }],
    };
    const handler = new ListCollectionsQueryHandler(registryWithFields as never, storeRegistry as never);
    const result = await handler.execute(new ListCollectionsQuery());
    expect(result[0].rowCount).toBe(0);
  });

  it("returns empty array when no collections defined", async () => {
    const storeRegistry = { get: () => undefined };
    const emptyRegistry = { list: () => [] };
    const handler = new ListCollectionsQueryHandler(emptyRegistry as never, storeRegistry as never);
    const result = await handler.execute(new ListCollectionsQuery());
    expect(result).toHaveLength(0);
  });
});

// ── CollectionRegistry ───────────────────────────────────────────────────────

describe("CollectionRegistry", () => {
  function makeAppConfig(collections: object[]) {
    return {
      env: {},
      collections,
    };
  }

  it("resolve returns definition when name matches", () => {
    const def = { name: "users", fields: {}, indexes: [] };
    const registry = new CollectionRegistry(makeAppConfig([def]) as never);
    expect(registry.resolve("users")).toBe(def);
  });

  it("resolve returns undefined for unknown name", () => {
    const registry = new CollectionRegistry(makeAppConfig([]) as never);
    expect(registry.resolve("missing")).toBeUndefined();
  });

  it("has returns true for registered collection", () => {
    const def = { name: "orders", fields: {}, indexes: [] };
    const registry = new CollectionRegistry(makeAppConfig([def]) as never);
    expect(registry.has("orders")).toBe(true);
  });

  it("has returns false for unknown collection", () => {
    const registry = new CollectionRegistry(makeAppConfig([]) as never);
    expect(registry.has("missing")).toBe(false);
  });

  it("list returns all registered definitions", () => {
    const defs = [
      { name: "a", fields: {}, indexes: [] },
      { name: "b", fields: {}, indexes: [] },
    ];
    const registry = new CollectionRegistry(makeAppConfig(defs) as never);
    const result = registry.list();
    expect(result).toHaveLength(2);
  });
});
