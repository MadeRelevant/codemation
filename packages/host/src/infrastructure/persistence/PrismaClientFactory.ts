import { PGlite } from "@electric-sql/pglite";
import { injectable } from "@codemation/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "./generated/prisma-client/client.js";

export type PglitePrismaClients = Readonly<{
  prismaClient: PrismaClient;
  pglite: PGlite;
}>;

@injectable()
export class PrismaClientFactory {
  createPostgres(databaseUrl: string): PrismaClient {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
  }

  async createPglite(dataDir: string): Promise<PglitePrismaClients> {
    const pglite = new PGlite(dataDir);
    try {
      await pglite.waitReady;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`PGlite failed to initialize properly for "${dataDir}". Cause: ${reason}`, { cause: error });
    }
    const adapter = new PrismaPGlite(pglite);
    const prismaClient = new PrismaClient({ adapter });
    return { prismaClient, pglite };
  }
}
