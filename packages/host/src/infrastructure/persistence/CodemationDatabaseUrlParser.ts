import path from "node:path";
import type { AppPersistenceConfig } from "../../presentation/config/AppConfig";

/**
 * Parses `CODEMATION_DATABASE_URL` into an {@link AppPersistenceConfig}.
 *
 * Supported schemes (case-insensitive):
 *   - `sqlite://relative/path/to/file.db`    → resolved relative to consumerRoot
 *   - `sqlite:///absolute/path/to/file.db`   → leading slash = POSIX absolute
 *   - `sqlite://C:/path/file.db`             → Windows-style absolute (path.isAbsolute()
 *                                              returns true for these)
 *   - `pgsql://user:pass@host:5432/dbname`   → normalised to postgresql://
 *   - `postgresql://user:pass@host:5432/db`  → pass-through (Prisma's expected scheme)
 *   - `postgres://user:pass@host:5432/db`    → pass-through (common alias)
 *
 * Throws on any other scheme. Empty / whitespace input is also an error — callers
 * should default before calling parse().
 */
export class CodemationDatabaseUrlParser {
  parse(url: string, consumerRoot: string): AppPersistenceConfig {
    const trimmed = url.trim();
    if (trimmed.length === 0) {
      throw new Error("CODEMATION_DATABASE_URL is empty.");
    }
    if (trimmed.toLowerCase().startsWith("sqlite://")) {
      const remainder = trimmed.slice("sqlite://".length);
      const filePath = path.isAbsolute(remainder) ? remainder : path.resolve(consumerRoot, remainder);
      return { kind: "sqlite", databaseFilePath: filePath };
    }
    if (trimmed.toLowerCase().startsWith("pgsql://")) {
      return { kind: "postgresql", databaseUrl: `postgresql://${trimmed.slice("pgsql://".length)}` };
    }
    if (trimmed.toLowerCase().startsWith("postgresql://") || trimmed.toLowerCase().startsWith("postgres://")) {
      return { kind: "postgresql", databaseUrl: trimmed };
    }
    throw new Error(
      `Unsupported CODEMATION_DATABASE_URL scheme: "${trimmed}". ` +
        `Use sqlite://, pgsql://, postgresql://, or postgres://.`,
    );
  }
}
