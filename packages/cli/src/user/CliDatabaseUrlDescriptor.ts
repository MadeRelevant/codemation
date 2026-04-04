import type { AppPersistenceConfig } from "@codemation/host/persistence";

/**
 * Formats a database URL for CLI messages without exposing credentials (no user/password).
 */
export class CliDatabaseUrlDescriptor {
  describePersistence(persistence: AppPersistenceConfig): string {
    if (persistence.kind === "none") {
      return "none";
    }
    if (persistence.kind === "postgresql") {
      return this.describeForDisplay(persistence.databaseUrl);
    }
    return `SQLite (${persistence.databaseFilePath})`;
  }

  describeForDisplay(databaseUrl: string | undefined): string {
    if (!databaseUrl || databaseUrl.trim().length === 0) {
      return "unknown database target";
    }
    try {
      const u = new URL(databaseUrl);
      const pathPart = u.pathname.replace(/^\//, "").split(/[?#]/)[0] ?? "";
      const databaseName = pathPart.length > 0 ? pathPart : "(default)";
      const defaultPort = u.protocol === "postgresql:" || u.protocol === "postgres:" ? "5432" : "";
      const port = u.port || defaultPort;
      const hostPort = port ? `${u.hostname}:${port}` : u.hostname;
      return `database "${databaseName}" on ${hostPort}`;
    } catch {
      return "configured database (URL not shown)";
    }
  }
}
