import { createClient } from "@libsql/client";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PrismaMigrationDeployer } from "../../src/infrastructure/persistence/PrismaMigrationDeployer";

class PrismaMigrationDeployerTestFixture {
  private constructor(readonly root: string) {}

  static async create(prefix: string): Promise<PrismaMigrationDeployerTestFixture> {
    const root = await mkdtemp(path.join(os.tmpdir(), prefix));
    return new PrismaMigrationDeployerTestFixture(root);
  }

  async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  async createFakePrismaCli(): Promise<string> {
    const cliPath = this.resolve("fake-prisma-cli.cjs");
    await writeFile(
      cliPath,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const outputPath = process.env.TEST_OUTPUT_PATH;",
        "fs.mkdirSync(path.dirname(outputPath), { recursive: true });",
        "fs.writeFileSync(outputPath, JSON.stringify({",
        "  cwd: process.cwd(),",
        "  argv: process.argv.slice(2),",
        "  databaseUrl: process.env.DATABASE_URL,",
        "  provider: process.env.CODEMATION_PRISMA_PROVIDER,",
        "  inheritedMarker: process.env.TEST_MARKER ?? null,",
        "}, null, 2));",
      ].join("\n"),
    );
    return cliPath;
  }

  async createRecoveringPrismaCli(): Promise<string> {
    const cliPath = this.resolve("recovering-prisma-cli.cjs");
    await writeFile(
      cliPath,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const args = process.argv.slice(2);",
        "const commandLogPath = process.env.TEST_COMMAND_LOG_PATH;",
        "const counterPath = process.env.TEST_COMMAND_COUNTER_PATH;",
        "const scenario = process.env.TEST_PRISMA_SCENARIO;",
        "const count = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, 'utf8')) : 0;",
        "const nextCount = count + 1;",
        "fs.mkdirSync(path.dirname(counterPath), { recursive: true });",
        "fs.writeFileSync(counterPath, String(nextCount));",
        "fs.mkdirSync(path.dirname(commandLogPath), { recursive: true });",
        "fs.appendFileSync(commandLogPath, JSON.stringify({",
        "  cwd: process.cwd(),",
        "  argv: args,",
        "  databaseUrl: process.env.DATABASE_URL,",
        "  provider: process.env.CODEMATION_PRISMA_PROVIDER,",
        "}) + '\\n');",
        "if (scenario === 'sqlite-repair-after-failed-migration' && nextCount === 1) {",
        "  process.stderr.write(",
        "    'Error: P3009\\n\\n' +",
        "    'migrate found failed migrations in the target database, new migrations will not be applied.\\n' +",
        "    'The `20260407140000_run_normalized_persistence` migration started at 2026-04-07 13:13:04.068 UTC failed\\n'",
        "  );",
        "  process.exit(1);",
        "}",
        "process.exit(0);",
      ].join("\n"),
    );
    return cliPath;
  }

  async createPrismaConfig(): Promise<string> {
    const prismaConfigPath = this.resolve("config", "prisma.config.ts");
    await mkdir(path.dirname(prismaConfigPath), { recursive: true });
    await writeFile(prismaConfigPath, "export default {};\n");
    return prismaConfigPath;
  }

  async readJsonOutput(): Promise<{
    cwd: string;
    argv: string[];
    databaseUrl: string;
    provider: string;
    inheritedMarker: string | null;
  }> {
    const content = await readFile(this.resolve("artifacts", "deploy.json"), "utf8");
    return JSON.parse(content) as {
      cwd: string;
      argv: string[];
      databaseUrl: string;
      provider: string;
      inheritedMarker: string | null;
    };
  }

  async readCommandLog(): Promise<
    Array<{
      cwd: string;
      argv: string[];
      databaseUrl: string;
      provider: string;
    }>
  > {
    const content = await readFile(this.resolve("artifacts", "commands.jsonl"), "utf8");
    return content
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { cwd: string; argv: string[]; databaseUrl: string; provider: string });
  }

  async createPartiallyMigratedNormalizedSqliteDatabase(): Promise<string> {
    const databaseFilePath = this.resolve(".codemation", "codemation.sqlite");
    await mkdir(path.dirname(databaseFilePath), { recursive: true });
    const client = createClient({ url: `file:${databaseFilePath}` });
    await client.execute(`
      CREATE TABLE "_prisma_migrations" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
        "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
      )
    `);
    await client.execute(`
      INSERT INTO "_prisma_migrations" (
        "id",
        "checksum",
        "finished_at",
        "migration_name",
        "logs",
        "rolled_back_at",
        "started_at",
        "applied_steps_count"
      ) VALUES (
        'migration-1',
        'checksum',
        NULL,
        '20260407140000_run_normalized_persistence',
        'failed migration',
        NULL,
        '2026-04-07T13:13:04.068Z',
        0
      )
    `);
    await client.execute(`
      CREATE TABLE "Run" (
        "run_id" TEXT NOT NULL PRIMARY KEY,
        "workflow_id" TEXT NOT NULL,
        "started_at" TEXT NOT NULL,
        "finished_at" TEXT,
        "status" TEXT NOT NULL,
        "revision" INTEGER NOT NULL DEFAULT 0,
        "parent_json" TEXT,
        "execution_options_json" TEXT,
        "control_json" TEXT,
        "workflow_snapshot_json" TEXT,
        "policy_snapshot_json" TEXT,
        "engine_counters_json" TEXT,
        "mutable_state_json" TEXT,
        "outputs_by_node_json" TEXT NOT NULL,
        "updated_at" TEXT NOT NULL
      )
    `);
    await client.execute(`
      INSERT INTO "Run" (
        "run_id",
        "workflow_id",
        "started_at",
        "finished_at",
        "status",
        "revision",
        "outputs_by_node_json",
        "updated_at"
      ) VALUES (
        'run-1',
        'wf.test',
        '2026-04-07T13:00:00.000Z',
        '2026-04-07T13:00:01.000Z',
        'completed',
        3,
        '{}',
        '2026-04-07T13:00:01.000Z'
      )
    `);
    client.close();
    return databaseFilePath;
  }

  resolve(...segments: string[]): string {
    return path.join(this.root, ...segments);
  }
}

describe("PrismaMigrationDeployer", () => {
  it("creates the parent directory and normalized runtime schema for a new SQLite database file", async () => {
    const fixture = await PrismaMigrationDeployerTestFixture.create("codemation-sqlite-parent-");
    try {
      const databaseFilePath = fixture.resolve(".codemation", "codemation.sqlite");
      const deployer = new PrismaMigrationDeployer();
      await deployer.deployPersistence({ kind: "sqlite", databaseFilePath }, process.env);
      await access(fixture.resolve(".codemation"));
      await access(databaseFilePath);
      const client = createClient({ url: `file:${databaseFilePath}` });
      const runColumnsResult = await client.execute('PRAGMA table_info("Run")');
      const tableNamesResult = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('RunWorkItem', 'ExecutionInstance', 'RunSlotProjection', 'Run_legacy') ORDER BY name",
      );
      const runColumns = runColumnsResult.rows.map((row) => String(row.name));
      const tableNames = tableNamesResult.rows.map((row) => String(row.name));
      expect(runColumns).toContain("finished_at");
      expect(runColumns).toContain("revision");
      expect(runColumns).toContain("outputs_by_node_json");
      expect(runColumns).not.toContain("state_json");
      expect(tableNames).toEqual(["ExecutionInstance", "RunSlotProjection", "RunWorkItem"]);
      client.close();
    } finally {
      await fixture.dispose();
    }
  });

  it("passes the PostgreSQL provider and database URL to the Prisma CLI", async () => {
    const fixture = await PrismaMigrationDeployerTestFixture.create("codemation-postgres-deploy-");
    try {
      const prismaCliPath = await fixture.createFakePrismaCli();
      const prismaConfigPath = await fixture.createPrismaConfig();
      const deployer = new PrismaMigrationDeployer();
      const databaseUrl = "postgresql://codemation:codemation@127.0.0.1:5432/codemation";
      const previousCliPath = process.env.CODEMATION_PRISMA_CLI_PATH;
      const previousConfigPath = process.env.CODEMATION_PRISMA_CONFIG_PATH;
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliPath;
      process.env.CODEMATION_PRISMA_CONFIG_PATH = prismaConfigPath;
      try {
        await deployer.deploy({
          databaseUrl,
          env: {
            TEST_MARKER: "kept",
            TEST_OUTPUT_PATH: fixture.resolve("artifacts", "deploy.json"),
          },
        });
      } finally {
        if (previousCliPath) {
          process.env.CODEMATION_PRISMA_CLI_PATH = previousCliPath;
        } else {
          delete process.env.CODEMATION_PRISMA_CLI_PATH;
        }
        if (previousConfigPath) {
          process.env.CODEMATION_PRISMA_CONFIG_PATH = previousConfigPath;
        } else {
          delete process.env.CODEMATION_PRISMA_CONFIG_PATH;
        }
      }

      const output = await fixture.readJsonOutput();
      expect(output.provider).toBe("postgresql");
      expect(output.databaseUrl).toBe(databaseUrl);
      expect(output.cwd).toBe(path.dirname(prismaConfigPath));
      expect(output.inheritedMarker).toBe("kept");
      expect(output.argv).toEqual(["migrate", "deploy", "--config", "prisma.config.ts"]);
    } finally {
      await fixture.dispose();
    }
  });

  it("passes an absolute SQLite file URL to the Prisma CLI", async () => {
    const fixture = await PrismaMigrationDeployerTestFixture.create("codemation-sqlite-deploy-");
    try {
      const prismaCliPath = await fixture.createFakePrismaCli();
      const prismaConfigPath = await fixture.createPrismaConfig();
      const databaseFilePath = fixture.resolve(".codemation", "codemation.sqlite");
      const deployer = new PrismaMigrationDeployer();
      const previousCliPath = process.env.CODEMATION_PRISMA_CLI_PATH;
      const previousConfigPath = process.env.CODEMATION_PRISMA_CONFIG_PATH;
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliPath;
      process.env.CODEMATION_PRISMA_CONFIG_PATH = prismaConfigPath;
      try {
        await deployer.deployPersistence(
          {
            kind: "sqlite",
            databaseFilePath,
          },
          {
            TEST_OUTPUT_PATH: fixture.resolve("artifacts", "deploy.json"),
          },
        );
      } finally {
        if (previousCliPath) {
          process.env.CODEMATION_PRISMA_CLI_PATH = previousCliPath;
        } else {
          delete process.env.CODEMATION_PRISMA_CLI_PATH;
        }
        if (previousConfigPath) {
          process.env.CODEMATION_PRISMA_CONFIG_PATH = previousConfigPath;
        } else {
          delete process.env.CODEMATION_PRISMA_CONFIG_PATH;
        }
      }

      const output = await fixture.readJsonOutput();
      expect(output.provider).toBe("sqlite");
      expect(output.databaseUrl).toBe(`file:${databaseFilePath}`);
      expect(output.argv).toEqual(["migrate", "deploy", "--config", "prisma.config.ts"]);
    } finally {
      await fixture.dispose();
    }
  });

  it("drops lingering Run_legacy tables on a subsequent SQLite startup", async () => {
    const fixture = await PrismaMigrationDeployerTestFixture.create("codemation-sqlite-legacy-cleanup-");
    try {
      const databaseFilePath = fixture.resolve(".codemation", "codemation.sqlite");
      const deployer = new PrismaMigrationDeployer();
      await deployer.deployPersistence({ kind: "sqlite", databaseFilePath }, process.env);
      const client = createClient({ url: `file:${databaseFilePath}` });
      await client.execute('CREATE TABLE "Run_legacy" ("run_id" TEXT NOT NULL PRIMARY KEY)');
      let legacyTables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Run_legacy'",
      );
      expect(legacyTables.rows).toEqual([{ name: "Run_legacy" }]);
      client.close();

      await deployer.deployPersistence({ kind: "sqlite", databaseFilePath }, process.env);

      const verifyClient = createClient({ url: `file:${databaseFilePath}` });
      legacyTables = await verifyClient.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Run_legacy'",
      );
      expect(legacyTables.rows).toEqual([]);
      verifyClient.close();
    } finally {
      await fixture.dispose();
    }
  });

  it("repairs a partially applied normalized SQLite migration and retries deploy", async () => {
    const fixture = await PrismaMigrationDeployerTestFixture.create("codemation-sqlite-recovery-");
    try {
      const prismaCliPath = await fixture.createRecoveringPrismaCli();
      const prismaConfigPath = await fixture.createPrismaConfig();
      const databaseFilePath = await fixture.createPartiallyMigratedNormalizedSqliteDatabase();
      const deployer = new PrismaMigrationDeployer();
      const previousCliPath = process.env.CODEMATION_PRISMA_CLI_PATH;
      const previousConfigPath = process.env.CODEMATION_PRISMA_CONFIG_PATH;
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliPath;
      process.env.CODEMATION_PRISMA_CONFIG_PATH = prismaConfigPath;
      try {
        await deployer.deployPersistence(
          {
            kind: "sqlite",
            databaseFilePath,
          },
          {
            TEST_PRISMA_SCENARIO: "sqlite-repair-after-failed-migration",
            TEST_COMMAND_COUNTER_PATH: fixture.resolve("artifacts", "counter.txt"),
            TEST_COMMAND_LOG_PATH: fixture.resolve("artifacts", "commands.jsonl"),
          },
        );
      } finally {
        if (previousCliPath) {
          process.env.CODEMATION_PRISMA_CLI_PATH = previousCliPath;
        } else {
          delete process.env.CODEMATION_PRISMA_CLI_PATH;
        }
        if (previousConfigPath) {
          process.env.CODEMATION_PRISMA_CONFIG_PATH = previousConfigPath;
        } else {
          delete process.env.CODEMATION_PRISMA_CONFIG_PATH;
        }
      }

      const commands = await fixture.readCommandLog();
      expect(commands.map((command) => command.argv)).toEqual([
        ["migrate", "deploy", "--config", "prisma.config.ts"],
        [
          "migrate",
          "resolve",
          "--applied",
          "20260407140000_run_normalized_persistence",
          "--config",
          "prisma.config.ts",
        ],
        ["migrate", "deploy", "--config", "prisma.config.ts"],
      ]);
      const client = createClient({ url: `file:${databaseFilePath}` });
      const projectionRows = await client.execute(
        'SELECT "run_id", "workflow_id", "revision" FROM "RunSlotProjection"',
      );
      expect(projectionRows.rows).toEqual([{ run_id: "run-1", workflow_id: "wf.test", revision: 3 }]);
      const legacyTables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Run_legacy'",
      );
      expect(legacyTables.rows).toEqual([]);
      client.close();
    } finally {
      await fixture.dispose();
    }
  });
});
