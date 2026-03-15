import { Client } from "pg";
import { GenericContainer } from "testcontainers";
import { PrismaClientFactory } from "../../../src/infrastructure/persistence/PrismaClientFactory";
import { PrismaMigrationDeployer } from "../../../src/infrastructure/persistence/PrismaMigrationDeployer";
import type { PrismaClient } from "../../../src/infrastructure/persistence/generated/prisma/client.js";
import { PostgresRollbackTransaction } from "./PostgresRollbackTransaction";

type StartedPostgresContainer = Readonly<{
  readonly databaseUrl: string;
  stop(): Promise<void>;
}>;

export class PostgresIntegrationDatabase {
  private static readonly migrationDeployer = new PrismaMigrationDeployer();
  private static readonly prismaClientFactory = new PrismaClientFactory();

  private prismaClient: PrismaClient | null = null;

  private constructor(
    readonly databaseUrl: string,
    private readonly adminDatabaseUrl: string,
    private readonly databaseName: string,
    private readonly startedContainer?: StartedPostgresContainer,
  ) {}

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
    const database = new PostgresIntegrationDatabase(databaseUrl, adminDatabaseUrl, databaseName, startedContainer);
    await database.createDatabase();
    if (applyMigrations) {
      await database.applyMigrations();
    }
    return database;
  }

  async close(): Promise<void> {
    await this.disconnectPrismaClient();
    await this.dropDatabase();
    await this.startedContainer?.stop();
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
      stop: async () => {
        await container.stop();
      },
    };
  }

  private static createDatabaseName(): string {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
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
    this.prismaClient = PostgresIntegrationDatabase.prismaClientFactory.create(this.databaseUrl);
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
    const client = new Client({ connectionString });
    await client.connect();
    return client;
  }
}
