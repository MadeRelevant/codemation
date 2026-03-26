import path from "node:path";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationDatabaseConfig,
  CodemationDatabaseKind,
} from "../../presentation/config/CodemationConfig";

export type ResolvedDatabasePersistence =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "postgresql"; databaseUrl: string }>
  | Readonly<{ kind: "pglite"; dataDir: string }>;

const DEFAULT_PGLITE_RELATIVE_DIR = ".codemation/pglite";

/**
 * Resolves whether persistence uses TCP PostgreSQL, embedded PGlite, or in-memory stores.
 * Uses {@link CodemationConfig.runtime.database} as the source of truth; optional `CODEMATION_DATABASE_KIND`
 * and `CODEMATION_PGLITE_DATA_DIR` can override kind / PGlite directory. `DATABASE_URL` is not read here—put
 * connection strings in `runtime.database.url` (often sourced from `process.env` inside `codemation.config.ts`).
 */
export class DatabasePersistenceResolver {
  resolve(
    args: Readonly<{ runtimeConfig: CodemationApplicationRuntimeConfig; env: NodeJS.ProcessEnv; consumerRoot: string }>,
  ): ResolvedDatabasePersistence {
    const db = args.runtimeConfig.database;
    if (!db) {
      return { kind: "none" };
    }
    const kind = this.resolveDatabaseKind(this.inferDatabaseKind(db), args.env);
    if (kind === "postgresql") {
      const url = db.url?.trim() ?? "";
      if (!url) {
        throw new Error('runtime.database.kind is "postgresql" but no database URL was set (runtime.database.url).');
      }
      if (!this.isPostgresUrl(url)) {
        throw new Error(
          `runtime.database.url must be a postgresql:// or postgres:// URL when kind is postgresql. Received: ${url}`,
        );
      }
      return { kind: "postgresql", databaseUrl: url };
    }
    const dataDir = this.resolvePgliteDataDirFromConfig(db, args.env, args.consumerRoot);
    return { kind: "pglite", dataDir };
  }

  resolveDatabaseKind(configured: CodemationDatabaseKind | undefined, env: NodeJS.ProcessEnv): CodemationDatabaseKind {
    const fromEnv = env.CODEMATION_DATABASE_KIND?.trim();
    if (fromEnv === "postgresql" || fromEnv === "pglite") {
      return fromEnv;
    }
    if (configured) {
      return configured;
    }
    return "pglite";
  }

  private inferDatabaseKind(db: CodemationDatabaseConfig): CodemationDatabaseKind {
    if (db.kind) {
      return db.kind;
    }
    const url = db.url?.trim();
    if (url && this.isPostgresUrl(url)) {
      return "postgresql";
    }
    return "pglite";
  }

  isPostgresUrl(value: string): boolean {
    return value.startsWith("postgresql://") || value.startsWith("postgres://");
  }

  isPgliteUrl(value: string): boolean {
    return value.startsWith("pglite:");
  }

  private resolvePgliteDataDirFromConfig(
    db: NonNullable<CodemationApplicationRuntimeConfig["database"]>,
    env: NodeJS.ProcessEnv,
    consumerRoot: string,
  ): string {
    const fromEnv = env.CODEMATION_PGLITE_DATA_DIR?.trim();
    if (fromEnv && fromEnv.length > 0) {
      return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(consumerRoot, fromEnv);
    }
    const configured = db.pgliteDataDir?.trim();
    if (configured && configured.length > 0) {
      return path.isAbsolute(configured) ? configured : path.resolve(consumerRoot, configured);
    }
    return path.resolve(consumerRoot, DEFAULT_PGLITE_RELATIVE_DIR);
  }
}
