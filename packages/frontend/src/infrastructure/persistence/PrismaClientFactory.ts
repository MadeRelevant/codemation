import { injectable } from "@codemation/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

@injectable()
export class PrismaClientFactory {
  create(databaseUrl: string): PrismaClient {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
  }
}
