import { CodemationPostgresPrismaClientFactory, type PrismaClient } from "@codemation/frontend/persistence";

type GlobalWithPrisma = typeof globalThis & {
  __codemationAuthPrisma__?: PrismaClient;
};

export class CodemationAuthPrismaClient {
  static get shared(): PrismaClient {
    return CodemationAuthPrismaClient.resolveSingleton();
  }

  private static resolveSingleton(): PrismaClient {
    const globalState = globalThis as GlobalWithPrisma;
    if (globalState.__codemationAuthPrisma__) {
      return globalState.__codemationAuthPrisma__;
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || databaseUrl.trim().length === 0) {
      throw new Error("DATABASE_URL is required for Codemation authentication.");
    }
    const prisma = CodemationPostgresPrismaClientFactory.create(databaseUrl.trim());
    globalState.__codemationAuthPrisma__ = prisma;
    return prisma;
  }
}
