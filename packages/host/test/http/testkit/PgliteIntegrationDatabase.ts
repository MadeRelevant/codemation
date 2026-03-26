import type { PGlite } from "@electric-sql/pglite";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { CodemationDatabaseConfig } from "../../../src/presentation/config/CodemationConfig";
import { PrismaClientFactory } from "../../../src/infrastructure/persistence/PrismaClientFactory";
import { PrismaMigrationDeployer } from "../../../src/infrastructure/persistence/PrismaMigrationDeployer";
import type { PrismaClient } from "../../../src/infrastructure/persistence/generated/prisma-client/client.js";
import { PostgresRollbackTransaction } from "./PostgresRollbackTransaction";

/**
 * Integration harness when {@link DATABASE_URL} uses the `pglite:` scheme (embedded Postgres).
 */
export class PgliteIntegrationDatabase {
  private static readonly migrationDeployer = new PrismaMigrationDeployer();
  private static readonly prismaClientFactory = new PrismaClientFactory();

  readonly codemationRuntimeDatabase: CodemationDatabaseConfig;

  private constructor(
    readonly databaseUrl: string,
    private readonly dataDir: string,
    private readonly deleteDataDirOnClose: boolean,
    private prismaClient: PrismaClient,
    private readonly pglite: PGlite,
  ) {
    this.codemationRuntimeDatabase = { kind: "pglite", pgliteDataDir: dataDir };
  }

  static async create(): Promise<PgliteIntegrationDatabase> {
    return await this.createInternal(true);
  }

  static async createUnmigrated(): Promise<PgliteIntegrationDatabase> {
    return await this.createInternal(false);
  }

  /**
   * Opens an existing PGlite data directory after global setup has applied migrations.
   * Does not run migrations (see {@link IntegrationDatabaseGlobalSetupRunner}).
   */
  static async connectShared(databaseUrl: string): Promise<PgliteIntegrationDatabase> {
    return await this.createInternal(false, databaseUrl);
  }

  static parsePgliteDataDirFromUrl(rawUrl: string, consumerRoot: string): string {
    const url = new URL(rawUrl);
    if (url.protocol !== "pglite:") {
      throw new Error(`Expected pglite: URL, received ${url.protocol}`);
    }
    const rawPath = url.pathname;
    if (!rawPath || rawPath === "/") {
      throw new Error(
        "pglite: DATABASE_URL must include a non-empty path (data directory), e.g. pglite:///tmp/codemation-pglite",
      );
    }
    const decoded = decodeURIComponent(rawPath);
    if (path.isAbsolute(decoded)) {
      return decoded;
    }
    return path.resolve(consumerRoot, decoded.replace(/^\/+/, ""));
  }

  private static async createInternal(
    applyMigrations: boolean,
    databaseUrlOverride?: string,
  ): Promise<PgliteIntegrationDatabase> {
    const rawUrl = databaseUrlOverride?.trim() ?? process.env.DATABASE_URL?.trim();
    if (!rawUrl?.startsWith("pglite:")) {
      throw new Error("PgliteIntegrationDatabase requires DATABASE_URL to use the pglite: scheme.");
    }
    const dataDir = PgliteIntegrationDatabase.parsePgliteDataDirFromUrl(rawUrl, process.cwd());
    const persistence = { kind: "pglite" as const, dataDir };
    const deleteDataDirOnClose = false;
    if (applyMigrations) {
      process.env.CODEMATION_HOST_PACKAGE_ROOT = PgliteIntegrationDatabase.resolveHostPackageRoot();
      await PgliteIntegrationDatabase.migrationDeployer.deployPersistence(persistence, process.env);
    }
    const { prismaClient, pglite } = await PgliteIntegrationDatabase.prismaClientFactory.createPglite(dataDir);
    return new PgliteIntegrationDatabase(rawUrl, dataDir, deleteDataDirOnClose, prismaClient, pglite);
  }

  static resolveHostPackageRoot(): string {
    const configured = process.env.CODEMATION_HOST_PACKAGE_ROOT;
    if (configured && configured.length > 0) {
      return configured;
    }
    return path.resolve(import.meta.dirname, "..", "..", "..");
  }

  async close(): Promise<void> {
    await this.prismaClient.$disconnect();
    await this.pglite.close();
    if (this.deleteDataDirOnClose) {
      await rm(this.dataDir, { force: true, recursive: true }).catch(() => null);
    }
  }

  async beginRollbackTransaction(): Promise<PostgresRollbackTransaction> {
    const transaction = new PostgresRollbackTransaction(this.prismaClient);
    await transaction.start();
    return transaction;
  }

  getPrismaClient(): PrismaClient {
    return this.prismaClient;
  }
}
