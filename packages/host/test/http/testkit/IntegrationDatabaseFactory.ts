import { readIntegrationDatabaseCache } from "./integrationDatabaseCache";
import { PostgresIntegrationDatabase } from "./PostgresIntegrationDatabase";
import { SqliteIntegrationDatabase } from "./SqliteIntegrationDatabase";

export type IntegrationDatabase = PostgresIntegrationDatabase | SqliteIntegrationDatabase;

function resolveSharedIntegrationDatabaseUrl(): string | undefined {
  const fromEnv = process.env.CODEMATION_INTEGRATION_SHARED_DATABASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return readIntegrationDatabaseCache()?.databaseUrl;
}

/**
 * Creates an integration database from {@link DATABASE_URL}: TCP PostgreSQL (or Docker testcontainers when unset)
 * or SQLite when the URL uses the `file:` scheme.
 *
 * After Vitest global setup, attaches to a single shared migrated database (no per-suite create/migrate).
 */
export class IntegrationDatabaseFactory {
  static async create(): Promise<IntegrationDatabase> {
    const shared = resolveSharedIntegrationDatabaseUrl();
    if (shared) {
      if (shared.startsWith("file:")) {
        return await SqliteIntegrationDatabase.connectShared(shared);
      }
      return PostgresIntegrationDatabase.connectShared(shared);
    }
    if (process.env.DATABASE_URL?.trim().startsWith("file:")) {
      return await SqliteIntegrationDatabase.create();
    }
    return await PostgresIntegrationDatabase.create();
  }

  static async createUnmigrated(): Promise<IntegrationDatabase> {
    if (process.env.DATABASE_URL?.trim().startsWith("file:")) {
      return await SqliteIntegrationDatabase.createUnmigrated();
    }
    return await PostgresIntegrationDatabase.createUnmigrated();
  }

  /**
   * A fresh database (new Postgres DB or SQLite file) even when Vitest global setup wired a shared URL.
   * Use for suites that cannot share one transactional Prisma client (e.g. async trigger polling).
   */
  static async createEphemeral(): Promise<IntegrationDatabase> {
    const savedShared = process.env.CODEMATION_INTEGRATION_SHARED_DATABASE_URL;
    try {
      delete process.env.CODEMATION_INTEGRATION_SHARED_DATABASE_URL;
      if (process.env.DATABASE_URL?.trim().startsWith("file:")) {
        return await SqliteIntegrationDatabase.create();
      }
      return await PostgresIntegrationDatabase.create();
    } finally {
      if (savedShared !== undefined) {
        process.env.CODEMATION_INTEGRATION_SHARED_DATABASE_URL = savedShared;
      }
    }
  }
}
