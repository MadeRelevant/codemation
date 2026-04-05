import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma-postgresql-client/client.js";

export class CodemationPostgresPrismaClientFactory {
  static create(databaseUrl: string): PrismaClient {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
  }
}
