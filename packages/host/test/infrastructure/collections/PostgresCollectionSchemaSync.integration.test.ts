import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { c, defineCollection } from "@codemation/core";
import { CollectionRegistry } from "../../../src/infrastructure/collections/CollectionRegistry";
import { CollectionSchemaSyncerFactory } from "../../../src/infrastructure/collections/CollectionSchemaSyncerFactory";
import type { AppConfig } from "../../../src/presentation/config/AppConfig";
import type { PrismaDatabaseClient } from "../../../src/infrastructure/persistence/PrismaDatabaseClient";
import { PostgresIntegrationDatabase } from "../../http/testkit/PostgresIntegrationDatabase";

class SilentLogger {
  info(_message: string): void {}
  debug(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
}

function makeAppConfig(databaseUrl: string, env: NodeJS.ProcessEnv = {}): AppConfig {
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
    persistence: { kind: "postgresql", databaseUrl },
    scheduler: { kind: "local", workerQueues: [] },
    eventing: { kind: "memory" },
    whitelabel: {},
    webSocketPort: 0,
    webSocketBindHost: "127.0.0.1",
  };
}

async function tableColumnNames(prismaClient: PrismaDatabaseClient, tableName: string): Promise<string[]> {
  const rows = await prismaClient.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'collections' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;
  return rows.map((r) => r.column_name);
}

async function indexNamesForTable(prismaClient: PrismaDatabaseClient, tableName: string): Promise<string[]> {
  const rows = await prismaClient.$queryRaw<{ index_name: string }[]>`
    SELECT i.relname AS index_name
    FROM pg_index ix
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'collections' AND t.relname = ${tableName} AND NOT ix.indisprimary
  `;
  return rows.map((r) => r.index_name);
}

describe("Postgres collection schema sync", () => {
  let db: PostgresIntegrationDatabase;
  let prismaClient: PrismaDatabaseClient;
  let databaseUrl: string;

  beforeEach(async () => {
    db = await PostgresIntegrationDatabase.create();
    prismaClient = db.getPrismaClient();
    databaseUrl = db.databaseUrl;
  });

  afterEach(async () => {
    await db.close();
  });

  it("creates tables and indexes in collections schema", async () => {
    const col = defineCollection({
      name: "pg_tasks",
      fields: {
        title: c.text().notNull(),
        done: c.bool(),
      },
      indexes: [{ on: ["title"], unique: false }],
    });

    const appConfig = makeAppConfig(databaseUrl);
    const registry = new CollectionRegistry({ ...appConfig, collections: [col.definition] });
    const logger = new SilentLogger();
    const syncer = CollectionSchemaSyncerFactory.create(appConfig, registry, prismaClient, logger);

    const result = await syncer.sync();

    expect(result.planned).toHaveLength(1);
    expect(result.applied).toHaveLength(1);

    const columns = await tableColumnNames(prismaClient, "pg_tasks");
    expect(columns).toContain("id");
    expect(columns).toContain("title");
    expect(columns).toContain("done");
    expect(columns).toContain("created_at");
    expect(columns).toContain("updated_at");

    const idxs = await indexNamesForTable(prismaClient, "pg_tasks");
    expect(idxs).toContain("idx_pg_tasks_title");
  });

  it("is idempotent — second sync produces no changes", async () => {
    const col = defineCollection({
      name: "pg_idem",
      fields: { title: c.text().notNull() },
    });

    const appConfig = makeAppConfig(databaseUrl);
    const registry = new CollectionRegistry({ ...appConfig, collections: [col.definition] });
    const logger = new SilentLogger();
    const syncer = CollectionSchemaSyncerFactory.create(appConfig, registry, prismaClient, logger);

    await syncer.sync();
    const second = await syncer.sync();

    expect(second.planned).toHaveLength(0);
    expect(second.applied).toHaveLength(0);
  });

  it("adds new columns on subsequent sync", async () => {
    const collName = "pg_evolving";
    const v1 = defineCollection({
      name: collName,
      fields: { title: c.text().notNull() },
    });

    const appConfig = makeAppConfig(databaseUrl);
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

    const columns = await tableColumnNames(prismaClient, collName);
    expect(columns).toContain("priority");
  });

  it("blocks destructive changes without env opt-in", async () => {
    const collName = "pg_drop_test";
    const v1 = defineCollection({
      name: collName,
      fields: {
        title: c.text().notNull(),
        legacy: c.text(),
      },
    });

    const appConfig = makeAppConfig(databaseUrl);
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

  it("allows destructive changes with CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE=1", async () => {
    const collName = "pg_drop_allowed";
    const v1 = defineCollection({
      name: collName,
      fields: {
        title: c.text().notNull(),
        legacy: c.text(),
      },
    });

    const appConfig = makeAppConfig(databaseUrl);
    const logger = new SilentLogger();

    const registry1 = new CollectionRegistry({ ...appConfig, collections: [v1.definition] });
    const syncer1 = CollectionSchemaSyncerFactory.create(appConfig, registry1, prismaClient, logger);
    await syncer1.sync();

    const v2 = defineCollection({
      name: collName,
      fields: { title: c.text().notNull() },
    });
    const registry2 = new CollectionRegistry({ ...appConfig, collections: [v2.definition] });
    const syncer2 = CollectionSchemaSyncerFactory.create(
      { ...appConfig, env: { CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE: "1" } },
      registry2,
      prismaClient,
      logger,
    );

    const result = await syncer2.sync();
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].dropColumns).toContain("legacy");

    const columns = await tableColumnNames(prismaClient, collName);
    expect(columns).not.toContain("legacy");
  });

  it("dry-run returns planned ops but does not apply changes", async () => {
    const collName = "pg_dry_run";
    const col = defineCollection({
      name: collName,
      fields: { title: c.text().notNull() },
    });

    const appConfig = makeAppConfig(databaseUrl);
    const registry = new CollectionRegistry({ ...appConfig, collections: [col.definition] });
    const logger = new SilentLogger();
    const syncer = CollectionSchemaSyncerFactory.create(appConfig, registry, prismaClient, logger);

    const result = await syncer.sync({ dryRun: true });

    expect(result.planned).toHaveLength(1);
    expect(result.applied).toHaveLength(0);

    const columns = await tableColumnNames(prismaClient, collName);
    expect(columns).toHaveLength(0);
  });
}, 60000);
