import "dotenv/config";
import { defineConfig } from "prisma/config";

class PrismaConfigEnvironment {
  static fallbackGenerateDatabaseUrl = "postgresql://codemation:codemation@127.0.0.1:5432/codemation";

  static resolveDatasourceUrl(): string {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl && databaseUrl.length > 0) {
      return databaseUrl;
    }
    // `prisma generate` only needs a schema-compatible datasource URL; runtime commands inject a real one.
    return this.fallbackGenerateDatabaseUrl;
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: PrismaConfigEnvironment.resolveDatasourceUrl(),
  },
});
