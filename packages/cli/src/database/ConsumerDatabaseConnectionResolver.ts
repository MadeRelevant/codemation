import type { CodemationConfig } from "@codemation/host";
import type { AppPersistenceConfig } from "@codemation/host/persistence";
import path from "node:path";

/**
 * Resolves TCP PostgreSQL vs SQLite vs none from env + {@link CodemationConfig} (same rules as the host runtime).
 */
export class ConsumerDatabaseConnectionResolver {
  resolve(processEnv: NodeJS.ProcessEnv, config: CodemationConfig, consumerRoot: string): AppPersistenceConfig {
    const database = config.runtime?.database;
    if (!database) {
      return { kind: "none" };
    }
    const databaseKind = this.resolveDatabaseKind(database.kind, database.url, processEnv);
    if (databaseKind === "postgresql") {
      const databaseUrl = database.url?.trim() ?? "";
      if (!databaseUrl) {
        throw new Error('runtime.database.kind is "postgresql" but no database URL was set (runtime.database.url).');
      }
      return { kind: "postgresql", databaseUrl };
    }
    return {
      kind: "sqlite",
      databaseFilePath: this.resolveSqliteFilePath(database.sqliteFilePath, processEnv, consumerRoot),
    };
  }

  private resolveDatabaseKind(
    configuredKind: "postgresql" | "sqlite" | undefined,
    databaseUrl: string | undefined,
    env: NodeJS.ProcessEnv,
  ): "postgresql" | "sqlite" {
    const kindFromEnv = env.CODEMATION_DATABASE_KIND?.trim();
    if (kindFromEnv === "postgresql" || kindFromEnv === "sqlite") {
      return kindFromEnv;
    }
    if (configuredKind) {
      return configuredKind;
    }
    const trimmedUrl = databaseUrl?.trim();
    if (trimmedUrl && (trimmedUrl.startsWith("postgresql://") || trimmedUrl.startsWith("postgres://"))) {
      return "postgresql";
    }
    return "sqlite";
  }

  private resolveSqliteFilePath(
    configuredPath: string | undefined,
    env: NodeJS.ProcessEnv,
    consumerRoot: string,
  ): string {
    const envPath = env.CODEMATION_SQLITE_FILE_PATH?.trim();
    if (envPath && envPath.length > 0) {
      return path.isAbsolute(envPath) ? envPath : path.resolve(consumerRoot, envPath);
    }
    const trimmedConfiguredPath = configuredPath?.trim();
    if (trimmedConfiguredPath && trimmedConfiguredPath.length > 0) {
      return path.isAbsolute(trimmedConfiguredPath)
        ? trimmedConfiguredPath
        : path.resolve(consumerRoot, trimmedConfiguredPath);
    }
    return path.resolve(consumerRoot, ".codemation", "codemation.sqlite");
  }
}
