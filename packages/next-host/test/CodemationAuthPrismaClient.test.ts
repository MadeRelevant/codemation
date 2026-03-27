import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClientFactory } from "@codemation/host-src/infrastructure/persistence/PrismaClientFactory";
import { PrismaClient } from "@codemation/host-src/infrastructure/persistence/generated/prisma-client/client.js";
import { PrismaMigrationDeployer } from "@codemation/host/persistence";
import { test } from "vitest";
import { CodemationAuthPrismaClient } from "../src/server/CodemationAuthPrismaClient";

type CodemationNextHostGlobal = typeof globalThis & {
  __codemationNextHost__?: {
    getPreparedPrismaClient(): Promise<PrismaClient>;
  };
};

test("CodemationAuthPrismaClient resolves the prepared PGlite prisma without DATABASE_URL", async () => {
  const savedDatabaseUrl = process.env.DATABASE_URL;
  const savedHostPackageRoot = process.env.CODEMATION_HOST_PACKAGE_ROOT;
  const savedNextHost = (globalThis as CodemationNextHostGlobal).__codemationNextHost__;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "codemation-auth-pglite-"));
  const hostPackageRoot = path.resolve(import.meta.dirname, "..", "..", "host");
  process.env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
  const migrationDeployer = new PrismaMigrationDeployer();
  const prismaClientFactory = new PrismaClientFactory();
  await migrationDeployer.deployPersistence({ kind: "pglite", dataDir }, process.env);
  const { prismaClient, pglite } = await prismaClientFactory.createPglite(dataDir);
  try {
    delete process.env.DATABASE_URL;
    (globalThis as CodemationNextHostGlobal).__codemationNextHost__ = {
      async getPreparedPrismaClient() {
        return prismaClient;
      },
    };

    const resolved = await CodemationAuthPrismaClient.resolveShared();
    assert.equal(resolved, prismaClient);
  } finally {
    await prismaClient.$disconnect();
    await pglite.close();
    if (savedDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
    if (savedHostPackageRoot === undefined) {
      delete process.env.CODEMATION_HOST_PACKAGE_ROOT;
    } else {
      process.env.CODEMATION_HOST_PACKAGE_ROOT = savedHostPackageRoot;
    }
    if (savedNextHost === undefined) {
      delete (globalThis as CodemationNextHostGlobal).__codemationNextHost__;
    } else {
      (globalThis as CodemationNextHostGlobal).__codemationNextHost__ = savedNextHost;
    }
  }
});
