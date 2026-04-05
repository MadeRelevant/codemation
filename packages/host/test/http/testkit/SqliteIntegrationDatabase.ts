import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodemationDatabaseConfig } from "../../../src/presentation/config/CodemationConfig";
import { PrismaClientFactory } from "../../../src/infrastructure/persistence/PrismaClientFactory";
import type { PrismaDatabaseClient } from "../../../src/infrastructure/persistence/PrismaDatabaseClient";
import { PrismaMigrationDeployer } from "../../../src/infrastructure/persistence/PrismaMigrationDeployer";
import { PostgresRollbackTransaction } from "./PostgresRollbackTransaction";

/**
 * Integration harness when {@link DATABASE_URL} uses a SQLite `file:` URL.
 */
export class SqliteIntegrationDatabase {
  private static readonly migrationDeployer = new PrismaMigrationDeployer();
  private static readonly prismaClientFactory = new PrismaClientFactory();

  readonly codemationRuntimeDatabase: CodemationDatabaseConfig;

  private constructor(
    readonly databaseUrl: string,
    private readonly databaseFilePath: string,
    private readonly cleanupRootPath: string | null,
    private prismaClient: PrismaDatabaseClient,
  ) {
    this.codemationRuntimeDatabase = { kind: "sqlite", sqliteFilePath: databaseFilePath };
  }

  static async create(): Promise<SqliteIntegrationDatabase> {
    return await this.createInternal(true);
  }

  static async createUnmigrated(): Promise<SqliteIntegrationDatabase> {
    return await this.createInternal(false);
  }

  /**
   * Opens an existing SQLite database file after global setup has applied migrations.
   * Does not run migrations (see {@link IntegrationDatabaseGlobalSetupRunner}).
   */
  static async connectShared(databaseUrl: string): Promise<SqliteIntegrationDatabase> {
    return await this.createInternal(false, databaseUrl);
  }

  static parseSqliteFilePathFromUrl(rawUrl: string): string {
    const url = new URL(rawUrl);
    if (url.protocol !== "file:") {
      throw new Error(`Expected file: URL, received ${url.protocol}`);
    }
    const decoded = decodeURIComponent(url.pathname);
    if (!decoded || decoded === "/") {
      throw new Error("SQLite DATABASE_URL must include an absolute file path, e.g. file:/tmp/codemation.sqlite");
    }
    return decoded;
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
    if (this.cleanupRootPath) {
      await rm(this.cleanupRootPath, { force: true, recursive: true }).catch(() => null);
    }
  }

  async beginRollbackTransaction(): Promise<PostgresRollbackTransaction> {
    const transaction = new PostgresRollbackTransaction(this.prismaClient);
    await transaction.start();
    return transaction;
  }

  getPrismaClient(): PrismaDatabaseClient {
    return this.prismaClient;
  }

  private static async createInternal(
    applyMigrations: boolean,
    databaseUrlOverride?: string,
  ): Promise<SqliteIntegrationDatabase> {
    const explicitDatabaseUrl = databaseUrlOverride?.trim() ?? process.env.DATABASE_URL?.trim();
    const databaseFilePath =
      explicitDatabaseUrl && explicitDatabaseUrl.startsWith("file:")
        ? this.parseSqliteFilePathFromUrl(explicitDatabaseUrl)
        : await this.createEphemeralDatabaseFilePath();
    const databaseUrl =
      explicitDatabaseUrl && explicitDatabaseUrl.startsWith("file:")
        ? explicitDatabaseUrl
        : this.databaseFilePathToUrl(databaseFilePath);
    const cleanupRootPath = explicitDatabaseUrl ? null : path.dirname(databaseFilePath);
    const persistence = { kind: "sqlite" as const, databaseFilePath };
    if (applyMigrations) {
      process.env.CODEMATION_HOST_PACKAGE_ROOT = this.resolveHostPackageRoot();
      await this.migrationDeployer.deployPersistence(persistence, process.env);
    }
    const prismaClient = this.prismaClientFactory.createSqlite(databaseFilePath);
    return new SqliteIntegrationDatabase(databaseUrl, databaseFilePath, cleanupRootPath, prismaClient);
  }

  private static async createEphemeralDatabaseFilePath(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "codemation-sqlite-"));
    return path.join(root, "codemation.sqlite");
  }

  private static databaseFilePathToUrl(databaseFilePath: string): string {
    return `file:${databaseFilePath}`;
  }
}
