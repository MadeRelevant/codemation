import { injectable } from "@codemation/core";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient as PostgresqlPrismaClient } from "./generated/prisma-postgresql-client/client.js";
import { PrismaClient as SqlitePrismaClient } from "./generated/prisma-sqlite-client/client.js";
import type { PrismaDatabaseClient } from "./PrismaDatabaseClient";

@injectable()
export class PrismaClientFactory {
  createPostgres(databaseUrl: string): PrismaDatabaseClient {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PostgresqlPrismaClient({ adapter });
  }

  createSqlite(databaseFilePath: string): PrismaDatabaseClient {
    const adapter = new PrismaLibSql({
      url: pathToFileURL(path.resolve(databaseFilePath)).toString(),
    });
    return new SqlitePrismaClient({ adapter }) as unknown as PrismaDatabaseClient;
  }
}
