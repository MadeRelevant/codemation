import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";
import { GenericContainer } from "testcontainers";
import type { CodemationDatabaseConfig } from "../../../src/presentation/config/CodemationConfig";
import { PrismaClientFactory } from "../../../src/infrastructure/persistence/PrismaClientFactory";
import { PrismaMigrationDeployer } from "../../../src/infrastructure/persistence/PrismaMigrationDeployer";
import type { PrismaClient } from "../../../src/infrastructure/persistence/generated/prisma-postgresql-client/client.js";
import { PostgresRollbackTransaction } from "./PostgresRollbackTransaction";

type StartedPostgresContainer = Readonly<{
  readonly databaseUrl: string;
  readonly dockerContainerId?: string;
  stop(): Promise<void>;
}>;

/** Serializable state for cross-process teardown (e.g. Playwright globalTeardown). */
export type PostgresIntegrationDatabaseSnapshot = Readonly<{
  readonly databaseUrl: string;
  readonly adminDatabaseUrl: string;
  readonly databaseName: string;
  readonly postgresDockerContainerId?: string;
}>;

const execFileAsync = promisify(execFile);

export const postgresIntegrationSharedDatabaseName = "codemation_integration_shared";

export class PostgresIntegrationDatabase {
  private static readonly migrationDeployer = new PrismaMigrationDeployer();
  private static readonly prismaClientFactory = new PrismaClientFactory();

  private prismaClient: PrismaClient | null = null;

  readonly codemationRuntimeDatabase: CodemationDatabaseConfig;

  private constructor(
    readonly databaseUrl: string,
    private readonly adminDatabaseUrl: string,
    private readonly databaseName: string,
    private readonly startedContainer?: StartedPostgresContainer,
    private readonly postgresDockerContainerId?: string,
    private readonly retainDatabaseOnClose = false,
  ) {
    this.codemationRuntimeDatabase = { kind: "postgresql", url: databaseUrl };
  }

  /**
   * Vitest global setup: create a fixed-name database, apply migrations once. Safe to re-run (idempotent).
   */
  static async provisionSharedForIntegrationGlobalSetup(): Promise<Readonly<{ databaseUrl: string }>> {
    const startedContainer = process.env.DATABASE_URL?.trim() ? undefined : await this.startContainer();
    const adminDatabaseUrl = process.env.DATABASE_URL?.trim() || startedContainer?.databaseUrl;
    if (!adminDatabaseUrl) {
      throw new Error("DATABASE_URL is required for PostgreSQL integration tests when Docker is unavailable.");
    }
    const databaseName = postgresIntegrationSharedDatabaseName;
    const databaseUrl = this.buildDatabaseUrl(adminDatabaseUrl, databaseName);
    const client = await this.connectAdmin(adminDatabaseUrl);
    try {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    } catch (error: unknown) {
      if (!this.isDuplicateDatabaseError(error)) {
        throw error;
      }
    } finally {
      await client.end();
    }
    await PostgresIntegrationDatabase.migrationDeployer.deploy({ databaseUrl });
    return { databaseUrl };
  }

  /**
   * Attaches to a database URL provisioned by {@link provisionSharedForIntegrationGlobalSetup} (no drop on close).
   */
  static connectShared(databaseUrl: string): PostgresIntegrationDatabase {
    return new PostgresIntegrationDatabase(databaseUrl, "", "", undefined, undefined, true);
  }

  private static isDuplicateDatabaseError(error: unknown): boolean {
    return (
      typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "42P04"
    );
  }

  static async create(): Promise<PostgresIntegrationDatabase> {
    return await this.createInternal(true);
  }

  static async createUnmigrated(): Promise<PostgresIntegrationDatabase> {
    return await this.createInternal(false);
  }

  private static async createInternal(applyMigrations: boolean): Promise<PostgresIntegrationDatabase> {
    const startedContainer = process.env.DATABASE_URL ? undefined : await this.startContainer();
    const adminDatabaseUrl = process.env.DATABASE_URL ?? startedContainer?.databaseUrl;
    if (!adminDatabaseUrl) {
      throw new Error("DATABASE_URL is required for PostgreSQL integration tests when Docker is unavailable.");
    }
    const databaseName = this.createDatabaseName();
    const databaseUrl = this.buildDatabaseUrl(adminDatabaseUrl, databaseName);
    const database = new PostgresIntegrationDatabase(
      databaseUrl,
      adminDatabaseUrl,
      databaseName,
      startedContainer,
      startedContainer?.dockerContainerId,
      false,
    );
    await database.createDatabase();
    if (applyMigrations) {
      await database.applyMigrations();
    }
    return database;
  }

  async close(): Promise<void> {
    await this.disconnectPrismaClient();
    if (this.retainDatabaseOnClose) {
      return;
    }
    await this.dropDatabase();
    await this.startedContainer?.stop();
  }

  serialize(): PostgresIntegrationDatabaseSnapshot {
    return {
      databaseUrl: this.databaseUrl,
      adminDatabaseUrl: this.adminDatabaseUrl,
      databaseName: this.databaseName,
      postgresDockerContainerId: this.postgresDockerContainerId,
    };
  }

  /**
   * Drops the ephemeral database and stops the Postgres testcontainer when one was started.
   * Used when global teardown runs in a different process than setup.
   */
  static async teardownSnapshot(snapshot: PostgresIntegrationDatabaseSnapshot): Promise<void> {
    const client = await PostgresIntegrationDatabase.connectAdmin(snapshot.adminDatabaseUrl);
    try {
      await client.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [snapshot.databaseName],
      );
      await client.query(`DROP DATABASE IF EXISTS "${snapshot.databaseName}"`);
    } finally {
      await client.end();
    }
    if (snapshot.postgresDockerContainerId !== undefined && snapshot.postgresDockerContainerId.trim().length > 0) {
      try {
        await execFileAsync("docker", ["stop", snapshot.postgresDockerContainerId], { timeout: 120_000 });
      } catch {
        // Best-effort: CI may not expose Docker to the teardown process.
      }
    }
  }

  getPrismaClient(): PrismaClient {
    return this.getOrCreatePrismaClient();
  }

  async beginRollbackTransaction(): Promise<PostgresRollbackTransaction> {
    const transaction = new PostgresRollbackTransaction(this.getOrCreatePrismaClient());
    await transaction.start();
    return transaction;
  }

  private static async startContainer(): Promise<StartedPostgresContainer> {
    const container = await new GenericContainer("postgres:16-alpine")
      .withEnvironment({
        POSTGRES_DB: "postgres",
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
      })
      .withExposedPorts(5432)
      .start();
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    return {
      databaseUrl: `postgresql://postgres:postgres@${host}:${port}/postgres`,
      dockerContainerId: container.getId(),
      stop: async () => {
        await container.stop();
      },
    };
  }

  private static createDatabaseName(): string {
    const suffix = randomBytes(12).toString("hex");
    return `codemation_frontend_${suffix}`;
  }

  private static buildDatabaseUrl(adminDatabaseUrl: string, databaseName: string): string {
    const url = new URL(adminDatabaseUrl);
    url.pathname = `/${databaseName}`;
    return url.toString();
  }

  private async createDatabase(): Promise<void> {
    const client = await this.connect(this.adminDatabaseUrl);
    try {
      await client.query(`CREATE DATABASE "${this.databaseName}"`);
    } finally {
      await client.end();
    }
  }

  private async dropDatabase(): Promise<void> {
    if (!this.adminDatabaseUrl.trim()) {
      return;
    }
    const client = await this.connect(this.adminDatabaseUrl);
    try {
      await client.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [this.databaseName],
      );
      await client.query(`DROP DATABASE IF EXISTS "${this.databaseName}"`);
    } finally {
      await client.end();
    }
  }

  private async applyMigrations(): Promise<void> {
    await PostgresIntegrationDatabase.migrationDeployer.deploy({
      databaseUrl: this.databaseUrl,
    });
  }

  private getOrCreatePrismaClient(): PrismaClient {
    if (this.prismaClient) {
      return this.prismaClient;
    }
    this.prismaClient = PostgresIntegrationDatabase.prismaClientFactory.createPostgres(this.databaseUrl);
    return this.prismaClient;
  }

  private async disconnectPrismaClient(): Promise<void> {
    if (!this.prismaClient) {
      return;
    }
    await this.prismaClient.$disconnect();
    this.prismaClient = null;
  }

  private async connect(connectionString: string): Promise<Client> {
    return await PostgresIntegrationDatabase.connectAdmin(connectionString);
  }

  private static async connectAdmin(connectionString: string): Promise<Client> {
    const client = new Client({ connectionString });
    await client.connect();
    return client;
  }
}
