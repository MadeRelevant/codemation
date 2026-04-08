import { createClient, type Client } from "@libsql/client";
import { injectable } from "@codemation/core";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppPersistenceConfig } from "../../presentation/config/AppConfig";

/**
 * Runs `prisma migrate deploy` against TCP PostgreSQL or a SQLite database file.
 */
@injectable()
export class PrismaMigrationDeployer {
  private static readonly normalizedRuntimeMigrationName = "20260407140000_run_normalized_persistence";
  private readonly require = createRequire(import.meta.url);

  async deployPersistence(persistence: AppPersistenceConfig, env?: Readonly<NodeJS.ProcessEnv>): Promise<void> {
    if (persistence.kind === "none") {
      return;
    }
    if (persistence.kind === "postgresql") {
      await this.deployPostgres({ databaseUrl: persistence.databaseUrl, env });
      return;
    }
    await this.deploySqlite({ databaseFilePath: persistence.databaseFilePath, env });
  }

  async deploy(args: Readonly<{ databaseUrl: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<void> {
    await this.deployPostgres(args);
  }

  private async deploySqlite(
    args: Readonly<{ databaseFilePath: string; env?: Readonly<NodeJS.ProcessEnv> }>,
  ): Promise<void> {
    await this.ensureSqliteParentDirectoryExists(args.databaseFilePath);
    const databaseUrl = this.sqliteFilePathToDatabaseUrl(args.databaseFilePath);
    try {
      await this.deployWithProvider({
        provider: "sqlite",
        databaseUrl,
        env: args.env,
      });
    } catch (error) {
      const recovered = await this.tryRecoverPartiallyAppliedNormalizedRuntimeMigration({
        databaseFilePath: args.databaseFilePath,
        databaseUrl,
        env: args.env,
        error,
      });
      if (!recovered) {
        throw error;
      }
    }
    await this.cleanupNormalizedRuntimeLegacyArtifacts(args.databaseFilePath);
  }

  private async deployPostgres(
    args: Readonly<{ databaseUrl: string; env?: Readonly<NodeJS.ProcessEnv> }>,
  ): Promise<void> {
    await this.deployWithProvider({
      provider: "postgresql",
      databaseUrl: args.databaseUrl,
      env: args.env,
    });
  }

  private async deployWithProvider(
    args: Readonly<{
      provider: "postgresql" | "sqlite";
      databaseUrl: string;
      env?: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): Promise<void> {
    await this.runPrismaCommand({
      prismaArgs: ["migrate", "deploy"],
      provider: args.provider,
      databaseUrl: args.databaseUrl,
      env: args.env,
    });
  }

  private async resolveAppliedMigration(
    args: Readonly<{
      provider: "postgresql" | "sqlite";
      databaseUrl: string;
      migrationName: string;
      env?: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): Promise<void> {
    await this.runPrismaCommand({
      prismaArgs: ["migrate", "resolve", "--applied", args.migrationName],
      provider: args.provider,
      databaseUrl: args.databaseUrl,
      env: args.env,
    });
  }

  private async runPrismaCommand(
    args: Readonly<{
      prismaArgs: string[];
      provider: "postgresql" | "sqlite";
      databaseUrl: string;
      env?: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): Promise<void> {
    const prismaConfigPath = this.resolveAbsolutePrismaConfigPath();
    await new Promise<void>((resolve, reject) => {
      const command = spawn(
        process.execPath,
        [...[this.resolvePrismaCliPath(), ...args.prismaArgs], "--config", path.basename(prismaConfigPath)],
        {
          cwd: path.dirname(prismaConfigPath),
          env: this.createProcessEnvironment(args.databaseUrl, args.provider, args.env),
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      command.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      command.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      command.once("error", (error) => {
        reject(error);
      });
      command.once("close", (exitCode) => {
        if (exitCode === 0) {
          resolve();
          return;
        }
        reject(this.createDeployError(exitCode, stdout, stderr));
      });
    });
  }

  private async tryRecoverPartiallyAppliedNormalizedRuntimeMigration(
    args: Readonly<{
      databaseFilePath: string;
      databaseUrl: string;
      env?: Readonly<NodeJS.ProcessEnv>;
      error: unknown;
    }>,
  ): Promise<boolean> {
    if (!this.isRecoverableNormalizedRuntimeMigrationError(args.error)) {
      return false;
    }
    const repaired = await this.repairPartiallyAppliedNormalizedRuntimeSqliteDatabase(args.databaseFilePath);
    if (!repaired) {
      return false;
    }
    await this.resolveAppliedMigration({
      provider: "sqlite",
      databaseUrl: args.databaseUrl,
      migrationName: PrismaMigrationDeployer.normalizedRuntimeMigrationName,
      env: args.env,
    });
    await this.deployWithProvider({
      provider: "sqlite",
      databaseUrl: args.databaseUrl,
      env: args.env,
    });
    return true;
  }

  private isRecoverableNormalizedRuntimeMigrationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return (
      error.message.includes("Error: P3009") &&
      error.message.includes(PrismaMigrationDeployer.normalizedRuntimeMigrationName)
    );
  }

  private async repairPartiallyAppliedNormalizedRuntimeSqliteDatabase(databaseFilePath: string): Promise<boolean> {
    const client = createClient({ url: this.sqliteFilePathToDatabaseUrl(databaseFilePath) });
    try {
      const failedMigration = await this.hasActiveFailedMigrationRecord(
        client,
        PrismaMigrationDeployer.normalizedRuntimeMigrationName,
      );
      if (!failedMigration) {
        return false;
      }
      const runColumns = await this.readSqliteTableColumns(client, "Run");
      const hasNormalizedRunShape =
        runColumns.has("finished_at") &&
        runColumns.has("revision") &&
        runColumns.has("outputs_by_node_json") &&
        !runColumns.has("state_json");
      if (!hasNormalizedRunShape) {
        return false;
      }
      await this.ensureNormalizedRuntimeRepairArtifacts(client);
      return true;
    } finally {
      client.close();
    }
  }

  private async hasActiveFailedMigrationRecord(client: Client, migrationName: string): Promise<boolean> {
    const result = await client.execute({
      sql: [
        'SELECT 1 AS "has_failed"',
        'FROM "_prisma_migrations"',
        'WHERE "migration_name" = ?',
        '  AND "finished_at" IS NULL',
        '  AND "rolled_back_at" IS NULL',
        "LIMIT 1",
      ].join(" "),
      args: [migrationName],
    });
    return result.rows.length > 0;
  }

  private async readSqliteTableColumns(client: Client, tableName: string): Promise<Set<string>> {
    const result = await client.execute(`PRAGMA table_info("${tableName}")`);
    return new Set(result.rows.map((row) => String(row.name)));
  }

  private async ensureNormalizedRuntimeRepairArtifacts(client: Client): Promise<void> {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "RunWorkItem" (
        "work_item_id" TEXT NOT NULL PRIMARY KEY,
        "run_id" TEXT NOT NULL,
        "workflow_id" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "target_node_id" TEXT NOT NULL,
        "batch_id" TEXT NOT NULL,
        "queue_name" TEXT,
        "claim_token" TEXT,
        "claimed_by" TEXT,
        "claimed_at" TEXT,
        "available_at" TEXT NOT NULL,
        "enqueued_at" TEXT NOT NULL,
        "completed_at" TEXT,
        "failed_at" TEXT,
        "source_instance_id" TEXT,
        "parent_instance_id" TEXT,
        "items_in" INTEGER NOT NULL,
        "inputs_by_port_json" TEXT NOT NULL,
        "error_json" TEXT,
        CONSTRAINT "RunWorkItem_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS "RunWorkItem_run_id_status_available_at_idx"
      ON "RunWorkItem"("run_id", "status", "available_at")
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS "RunWorkItem_run_id_target_node_id_batch_id_idx"
      ON "RunWorkItem"("run_id", "target_node_id", "batch_id")
    `);
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "RunSlotProjection" (
        "run_id" TEXT NOT NULL PRIMARY KEY,
        "workflow_id" TEXT NOT NULL,
        "revision" INTEGER NOT NULL,
        "updated_at" TEXT NOT NULL,
        "slot_states_json" TEXT NOT NULL,
        CONSTRAINT "RunSlotProjection_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS "RunSlotProjection_workflow_id_updated_at_idx"
      ON "RunSlotProjection"("workflow_id", "updated_at")
    `);
    await client.execute(`
      INSERT OR IGNORE INTO "RunSlotProjection" (
        "run_id",
        "workflow_id",
        "revision",
        "updated_at",
        "slot_states_json"
      )
      SELECT
        "run_id",
        "workflow_id",
        "revision",
        "updated_at",
        json_object('slotStatesByNodeId', json('{}'))
      FROM "Run"
    `);
  }

  private async cleanupNormalizedRuntimeLegacyArtifacts(databaseFilePath: string): Promise<void> {
    const client = createClient({ url: this.sqliteFilePathToDatabaseUrl(databaseFilePath) });
    try {
      const runColumns = await this.readSqliteTableColumns(client, "Run");
      const hasNormalizedRunShape =
        runColumns.has("finished_at") &&
        runColumns.has("revision") &&
        runColumns.has("outputs_by_node_json") &&
        !runColumns.has("state_json");
      if (!hasNormalizedRunShape) {
        return;
      }
      const runSlotProjectionColumns = await this.readSqliteTableColumns(client, "RunSlotProjection");
      await client.execute('DROP TABLE IF EXISTS "Run_legacy"');
      if (runSlotProjectionColumns.size > 0) {
        await client.execute('DROP TABLE IF EXISTS "RunProjection"');
      }
    } finally {
      client.close();
    }
  }

  private sqliteFilePathToDatabaseUrl(databaseFilePath: string): string {
    return `file:${path.resolve(databaseFilePath)}`;
  }

  private createProcessEnvironment(
    databaseUrl: string,
    provider: "postgresql" | "sqlite",
    env?: Readonly<NodeJS.ProcessEnv>,
  ): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...(env ?? {}),
      DATABASE_URL: databaseUrl,
      CODEMATION_PRISMA_PROVIDER: provider,
    };
  }

  private resolvePrismaCliPath(): string {
    const configuredPath = process.env.CODEMATION_PRISMA_CLI_PATH;
    if (configuredPath && existsSync(configuredPath)) {
      return configuredPath;
    }
    const packageManagerCandidates = [
      path.resolve(process.cwd(), "node_modules", "prisma", "build", "index.js"),
      path.resolve(this.resolvePackageRoot(), "node_modules", "prisma", "build", "index.js"),
    ];
    for (const candidate of packageManagerCandidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    try {
      return this.require.resolve("prisma/build/index.js", {
        paths: [process.cwd(), this.resolvePackageRoot()],
      });
    } catch {
      throw new Error(
        "Unable to resolve the Prisma CLI required for startup migrations. Ensure `prisma` is installed.",
      );
    }
  }

  private resolveAbsolutePrismaConfigPath(): string {
    const configuredPath = process.env.CODEMATION_PRISMA_CONFIG_PATH;
    if (configuredPath) {
      return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(this.resolvePackageRoot(), configuredPath);
    }
    return path.resolve(this.resolvePackageRoot(), "prisma.config.ts");
  }

  resolvePackageRoot(): string {
    const configuredRoot = process.env.CODEMATION_HOST_PACKAGE_ROOT;
    if (configuredRoot) {
      return configuredRoot;
    }
    let currentDirectory = path.dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 8; depth += 1) {
      if (existsSync(path.join(currentDirectory, "prisma", "schema.postgresql.prisma"))) {
        return currentDirectory;
      }
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        break;
      }
      currentDirectory = parentDirectory;
    }
    throw new Error(`Could not locate prisma/schema.postgresql.prisma near ${fileURLToPath(import.meta.url)}.`);
  }

  private async ensureSqliteParentDirectoryExists(databaseFilePath: string): Promise<void> {
    await mkdir(path.dirname(databaseFilePath), { recursive: true });
  }

  private createDeployError(exitCode: number | null, stdout: string, stderr: string): Error {
    const output = stderr.trim() || stdout.trim();
    if (!output) {
      return new Error(`Prisma migrate deploy failed during startup with exit code ${exitCode ?? "unknown"}.`);
    }
    return new Error(`Prisma migrate deploy failed during startup with exit code ${exitCode ?? "unknown"}.\n${output}`);
  }
}
