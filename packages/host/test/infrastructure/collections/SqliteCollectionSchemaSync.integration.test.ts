import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { c, defineCollection } from "@codemation/core";
import { CollectionRegistry } from "../../../src/infrastructure/collections/CollectionRegistry";
import { CollectionSchemaSyncerFactory } from "../../../src/infrastructure/collections/CollectionSchemaSyncerFactory";
import type { AppConfig } from "../../../src/presentation/config/AppConfig";
import type { PrismaDatabaseClient } from "../../../src/infrastructure/persistence/PrismaDatabaseClient";
import { SqliteIntegrationDatabase } from "../../http/testkit/SqliteIntegrationDatabase";

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
    mcpServers: [],
  };
}

async function tableColumnNames(prismaClient: PrismaDatabaseClient, tableName: string): Promise<string[]> {
  const rows = await prismaClient.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${tableName}")`);
  return rows.map((r) => r.name);
}

async function indexNamesForTable(prismaClient: PrismaDatabaseClient, tableName: string): Promise<string[]> {
  const rows = await prismaClient.$queryRawUnsafe<{ name: string; origin: string }[]>(
    `PRAGMA index_list("${tableName}")`,
  );
  return rows.filter((r) => r.origin !== "pk").map((r) => r.name);
}

describe.skipIf(!process.env.DATABASE_URL?.startsWith("file:"))(
  "SQLite collection schema sync",
  () => {
    let db: SqliteIntegrationDatabase;
    let prismaClient: PrismaDatabaseClient;
    let databaseFilePath: string;

    beforeEach(async () => {
      db = await SqliteIntegrationDatabase.create();
      prismaClient = db.getPrismaClient();
      // Extract file path from the codemationRuntimeDatabase config
      const dbConfig = db.codemationRuntimeDatabase;
      if (dbConfig.kind !== "sqlite" || !dbConfig.sqliteFilePath) {
        throw new Error("Expected SQLite database config");
      }
      databaseFilePath = dbConfig.sqliteFilePath;
    });

    afterEach(async () => {
      await db.close();
    });

    it("creates tables and indexes for declared collections", async () => {
      const taskCollection = defineCollection({
        name: "tasks",
        fields: {
          title: c.text().notNull(),
          done: c.bool(),
        },
        indexes: [{ on: ["title"], unique: false }],
      });

      const appConfig = makeAppConfig(databaseFilePath);
      const registry = new CollectionRegistry({ ...appConfig, collections: [taskCollection.definition] });
      const logger = new SilentLogger();
      const syncer = CollectionSchemaSyncerFactory.create(appConfig, registry, prismaClient, logger);

      const result = await syncer.sync();

      expect(result.planned).toHaveLength(1);
      expect(result.applied).toHaveLength(1);

      const columns = await tableColumnNames(prismaClient, "collections_tasks");
      expect(columns).toContain("id");
      expect(columns).toContain("title");
      expect(columns).toContain("done");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");

      const idxs = await indexNamesForTable(prismaClient, "collections_tasks");
      expect(idxs).toContain("idx_tasks_title");
    });

    it("is idempotent — second sync produces no changes", async () => {
      const taskCollection = defineCollection({
        name: "tasks_idem",
        fields: { title: c.text().notNull() },
      });

      const appConfig = makeAppConfig(databaseFilePath);
      const registry = new CollectionRegistry({ ...appConfig, collections: [taskCollection.definition] });
      const logger = new SilentLogger();
      const syncer = CollectionSchemaSyncerFactory.create(appConfig, registry, prismaClient, logger);

      await syncer.sync();
      const second = await syncer.sync();

      expect(second.planned).toHaveLength(0);
      expect(second.applied).toHaveLength(0);
    });

    it("adds new columns on subsequent sync", async () => {
      const collName = "evolving_tasks";
      const v1 = defineCollection({
        name: collName,
        fields: { title: c.text().notNull() },
      });

      const appConfig = makeAppConfig(databaseFilePath);
      const logger = new SilentLogger();

      const registry1 = new CollectionRegistry({ ...appConfig, collections: [v1.definition] });
      const syncer1 = CollectionSchemaSyncerFactory.create(appConfig, registry1, prismaClient, logger);
      await syncer1.sync();

      const v2 = defineCollection({
        name: collName,
        fields: {
          title: c.text().notNull(),
          priority: c.int(),
        },
      });
      const registry2 = new CollectionRegistry({ ...appConfig, collections: [v2.definition] });
      const syncer2 = CollectionSchemaSyncerFactory.create(appConfig, registry2, prismaClient, logger);
      const result = await syncer2.sync();

      expect(result.applied).toHaveLength(1);
      expect(result.applied[0].addColumns).toHaveLength(1);
      expect(result.applied[0].addColumns[0].name).toBe("priority");

      const columns = await tableColumnNames(prismaClient, `collections_${collName}`);
      expect(columns).toContain("priority");
    });

    it("blocks destructive changes without env opt-in", async () => {
      const collName = "drop_test_sqlite";
      const v1 = defineCollection({
        name: collName,
        fields: {
          title: c.text().notNull(),
          legacy: c.text(),
        },
      });

      const appConfig = makeAppConfig(databaseFilePath);
      const logger = new SilentLogger();

      const registry1 = new CollectionRegistry({ ...appConfig, collections: [v1.definition] });
      const syncer1 = CollectionSchemaSyncerFactory.create(appConfig, registry1, prismaClient, logger);
      await syncer1.sync();

      const v2 = defineCollection({
        name: collName,
        fields: { title: c.text().notNull() },
      });
      const registry2 = new CollectionRegistry({ ...appConfig, collections: [v2.definition] });
      const syncer2 = CollectionSchemaSyncerFactory.create(appConfig, registry2, prismaClient, logger);

      await expect(syncer2.sync()).rejects.toThrow("CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE");
    });

    it("dry-run returns planned ops but does not apply changes", async () => {
      const collName = "dry_run_sqlite";
      const v1 = defineCollection({
        name: collName,
        fields: { title: c.text().notNull() },
      });

      const appConfig = makeAppConfig(databaseFilePath);
      const registry = new CollectionRegistry({ ...appConfig, collections: [v1.definition] });
      const logger = new SilentLogger();
      const syncer = CollectionSchemaSyncerFactory.create(appConfig, registry, prismaClient, logger);

      const result = await syncer.sync({ dryRun: true });

      expect(result.planned).toHaveLength(1);
      expect(result.applied).toHaveLength(0);

      const rows = await prismaClient.$queryRaw<{ name: string }[]>`
        SELECT name FROM sqlite_master WHERE type='table' AND name=${"collections_" + collName}
      `;
      expect(rows).toHaveLength(0);
    });
  },
  30000,
);
