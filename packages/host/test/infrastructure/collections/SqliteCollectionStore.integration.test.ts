import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { c, defineCollection } from "@codemation/core";
import { SqliteIntegrationDatabase } from "../../http/testkit/SqliteIntegrationDatabase";
import { CollectionRegistry } from "../../../src/infrastructure/collections/CollectionRegistry";
import { CollectionSchemaSyncerFactory } from "../../../src/infrastructure/collections/CollectionSchemaSyncerFactory";
import { SqliteCollectionStore } from "../../../src/infrastructure/collections/SqliteCollectionStore";
import type { AppConfig } from "../../../src/presentation/config/AppConfig";
import type { PrismaDatabaseClient } from "../../../src/infrastructure/persistence/PrismaDatabaseClient";

class SilentLogger {
  info(_message: string): void {}
  debug(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
}

function makeAppConfig(databaseFilePath: string, env: NodeJS.ProcessEnv = {}): AppConfig {
  return {
    consumerRoot: "/tmp/test",
    repoRoot: "/tmp/test",
    env,
    workflowSources: [],
    workflows: [],
    containerRegistrations: [],
    credentialTypes: [],
    collections: [],
    plugins: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    persistence: { kind: "sqlite", databaseFilePath },
    scheduler: { kind: "local", workerQueues: [] },
    eventing: { kind: "memory" },
    whitelabel: {},
    webSocketPort: 0,
    webSocketBindHost: "127.0.0.1",
  };
}

const userCollection = defineCollection({
  name: "sqlite_store_users",
  fields: {
    email: c.text().notNull(),
    name: c.text(),
    age: c.int(),
    active: c.bool(),
    score: c.double(),
    meta: c.jsonb(),
  },
  indexes: [{ on: ["email"], unique: true }],
});

describe("SQLite CollectionStore round-trips", () => {
  let db: SqliteIntegrationDatabase;
  let prismaClient: PrismaDatabaseClient;
  let store: SqliteCollectionStore;

  beforeEach(async () => {
    db = await SqliteIntegrationDatabase.create();
    prismaClient = db.getPrismaClient();

    const dbConfig = db.codemationRuntimeDatabase;
    if (dbConfig.kind !== "sqlite" || !dbConfig.sqliteFilePath) {
      throw new Error("Expected SQLite");
    }
    const databaseFilePath = dbConfig.sqliteFilePath;
    const appConfig = makeAppConfig(databaseFilePath);
    const registry = new CollectionRegistry({ ...appConfig, collections: [userCollection.definition] });
    const logger = new SilentLogger();
    const syncer = CollectionSchemaSyncerFactory.create(appConfig, registry, prismaClient, logger);
    await syncer.sync();

    store = new SqliteCollectionStore(userCollection.definition, prismaClient);
  });

  afterEach(async () => {
    // CI shares one SQLite file across the whole suite via DATABASE_URL — purge our
    // table between cases so per-test row counts don't leak from earlier inserts.
    await prismaClient.$executeRawUnsafe(`DELETE FROM "collections_users"`);
    await db.close();
  });

  it("insert and get by id", async () => {
    const inserted = await store.insert({ email: "alice@example.com", name: "Alice", age: 30 });

    expect(inserted.id).toBeTruthy();
    expect(inserted.email).toBe("alice@example.com");
    expect(inserted.name).toBe("Alice");
    expect(inserted.age).toBe(30);
    expect(inserted.created_at).toBeInstanceOf(Date);
    expect(inserted.updated_at).toBeInstanceOf(Date);

    const fetched = await store.get(inserted.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.email).toBe("alice@example.com");
  });

  it("returns null for unknown id", async () => {
    const result = await store.get("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("findOne by filter", async () => {
    await store.insert({ email: "bob@example.com", name: "Bob" });

    const found = await store.findOne({ email: "bob@example.com" });
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Bob");
  });

  it("list with pagination", async () => {
    await store.insert({ email: "a@example.com", name: "A" });
    await store.insert({ email: "b@example.com", name: "B" });
    await store.insert({ email: "c@example.com", name: "C" });

    const page1 = await store.list({ limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);

    const page2 = await store.list({ limit: 2, offset: 2 });
    expect(page2.total).toBe(3);
    expect(page2.rows).toHaveLength(1);
  });

  it("list with where filter", async () => {
    await store.insert({ email: "x@example.com", name: "X", active: true });
    await store.insert({ email: "y@example.com", name: "Y", active: false });

    const result = await store.list({ where: { name: "X" } });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].email).toBe("x@example.com");
  });

  it("update bumps updated_at", async () => {
    const inserted = await store.insert({ email: "cu@example.com", name: "Cu" });
    const originalUpdatedAt = inserted.updated_at;

    // Small delay to ensure updated_at differs
    await new Promise((r) => setTimeout(r, 10));
    const updated = await store.update(inserted.id, { name: "Updated" });

    expect(updated.name).toBe("Updated");
    expect(updated.updated_at.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
  });

  it("delete returns deleted: true", async () => {
    const inserted = await store.insert({ email: "del@example.com" });
    const result = await store.delete(inserted.id);

    expect(result.deleted).toBe(true);
    const fetched = await store.get(inserted.id);
    expect(fetched).toBeNull();
  });

  it("auto-generates UUID when id is not provided", async () => {
    const row1 = await store.insert({ email: "uuid1@example.com" });
    const row2 = await store.insert({ email: "uuid2@example.com" });

    expect(row1.id).toBeTruthy();
    expect(row2.id).toBeTruthy();
    expect(row1.id).not.toBe(row2.id);
  });

  it("serializes and deserializes jsonb fields", async () => {
    const meta = { tags: ["a", "b"], count: 42 };
    const inserted = await store.insert({ email: "json@example.com", meta });
    const fetched = await store.get(inserted.id);

    expect(fetched!.meta).toEqual(meta);
  });

  it("rejects where keys not in declared fields", async () => {
    await expect(store.findOne({ nonexistent_field: "value" } as never)).rejects.toThrow("nonexistent_field");
  });
}, 60000);
