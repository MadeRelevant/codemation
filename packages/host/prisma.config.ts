import "dotenv/config";
import { defineConfig } from "prisma/config";

class PrismaConfigEnvironment {
  static fallbackGeneratePostgresqlDatabaseUrl = "postgresql://codemation:codemation@127.0.0.1:5432/codemation";
  static fallbackGenerateSqliteDatabaseUrl = "file:./.codemation/prisma-generate.sqlite";

  static resolveProvider(): "postgresql" | "sqlite" {
    const configuredProvider = process.env.CODEMATION_PRISMA_PROVIDER?.trim();
    if (configuredProvider === "postgresql" || configuredProvider === "sqlite") {
      return configuredProvider;
    }
    return "postgresql";
  }

  static resolveSchemaPath(): string {
    return this.resolveProvider() === "sqlite" ? "prisma/schema.sqlite.prisma" : "prisma/schema.postgresql.prisma";
  }

  static resolveMigrationsPath(): string {
    return this.resolveProvider() === "sqlite" ? "prisma/migrations.sqlite" : "prisma/migrations";
  }

  static resolveDatasourceUrl(): string {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl && databaseUrl.length > 0) {
      return databaseUrl;
    }
    // `prisma generate` only needs a schema-compatible datasource URL; runtime commands inject a real one.
    return this.resolveProvider() === "sqlite"
      ? this.fallbackGenerateSqliteDatabaseUrl
      : this.fallbackGeneratePostgresqlDatabaseUrl;
  }
}

export default defineConfig({
  schema: PrismaConfigEnvironment.resolveSchemaPath(),
  migrations: {
    path: PrismaConfigEnvironment.resolveMigrationsPath(),
  },
  datasource: {
    url: PrismaConfigEnvironment.resolveDatasourceUrl(),
  },
});
