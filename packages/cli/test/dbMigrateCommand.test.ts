import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppPersistenceConfig } from "@codemation/host/persistence";
import { expect, test } from "vitest";

import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import type { Logger } from "@codemation/host/next/server";

import { DbMigrateCommand } from "../src/commands/DbMigrateCommand";
import { ConsumerCliTsconfigPreparation } from "../src/consumer/ConsumerCliTsconfigPreparation";
import { ConsumerDatabaseConnectionResolver } from "../src/database/ConsumerDatabaseConnectionResolver";
import { DatabaseMigrationsApplyService } from "../src/database/DatabaseMigrationsApplyService";
import { CliDatabaseUrlDescriptor } from "../src/user/CliDatabaseUrlDescriptor";
import { UserAdminConsumerDotenvLoader } from "../src/user/UserAdminConsumerDotenvLoader";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class RecordingMigrationDeployer {
  public last: { persistence: AppPersistenceConfig; env: NodeJS.ProcessEnv } | null = null;

  async deployPersistence(persistence: AppPersistenceConfig, env?: Readonly<NodeJS.ProcessEnv>): Promise<void> {
    this.last = { persistence, env: { ...process.env, ...(env ?? {}) } };
  }
}

test("runs migrations using runtime.database.url from consumer config (after .env load) and passes persistence to the deployer", async () => {
  const savedTsconfig = process.env.CODEMATION_TSCONFIG_PATH;
  const savedDatabaseUrl = process.env.DATABASE_URL;
  const savedPrismaConfigPath = process.env.CODEMATION_PRISMA_CONFIG_PATH;
  let tempRoot: string | null = null;
  try {
    process.env.CODEMATION_TSCONFIG_PATH = path.join(repoRoot, "tsconfig.codemation-tsx.json");
    if (savedDatabaseUrl !== undefined) {
      delete process.env.DATABASE_URL;
    }

    tempRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-db-migrate-"));
    await mkdir(tempRoot, { recursive: true });
    await writeFile(
      path.join(tempRoot, ".env"),
      "DATABASE_URL=postgresql://localhost:5432/cli_migrate_fixture\n",
      "utf8",
    );
    await writeFile(
      path.join(tempRoot, "codemation.config.js"),
      `module.exports = {
  workflows: [],
  runtime: {
    database: {
      kind: "postgresql",
      url: process.env.DATABASE_URL,
    },
  },
};
`,
      "utf8",
    );

    const runner = new RecordingMigrationDeployer();
    const hostRoot = path.join(repoRoot, "packages", "host");
    const command = new DbMigrateCommand(
      new DatabaseMigrationsApplyService(
        silentLogger,
        new UserAdminConsumerDotenvLoader(),
        new ConsumerCliTsconfigPreparation(),
        new CodemationConsumerConfigLoader(),
        new ConsumerDatabaseConnectionResolver(),
        new CliDatabaseUrlDescriptor(),
        hostRoot,
        runner,
      ),
    );

    await command.execute({ consumerRoot: tempRoot });

    expect(runner.last).not.toBeNull();
    expect(runner.last?.persistence).toEqual({
      kind: "postgresql",
      databaseUrl: "postgresql://localhost:5432/cli_migrate_fixture",
    });
    expect(process.env.CODEMATION_HOST_PACKAGE_ROOT).toBe(hostRoot);
    expect(process.env.CODEMATION_PRISMA_CONFIG_PATH).toBe(path.join(hostRoot, "prisma.config.ts"));
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { force: true, recursive: true }).catch(() => null);
    }
    if (savedDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
    if (savedTsconfig === undefined) {
      delete process.env.CODEMATION_TSCONFIG_PATH;
    } else {
      process.env.CODEMATION_TSCONFIG_PATH = savedTsconfig;
    }
    if (savedPrismaConfigPath === undefined) {
      delete process.env.CODEMATION_PRISMA_CONFIG_PATH;
    } else {
      process.env.CODEMATION_PRISMA_CONFIG_PATH = savedPrismaConfigPath;
    }
  }
});

test("throws when no database persistence can be resolved", async () => {
  const savedTsconfig = process.env.CODEMATION_TSCONFIG_PATH;
  const savedDatabaseUrl = process.env.DATABASE_URL;
  const savedPrismaConfigPath = process.env.CODEMATION_PRISMA_CONFIG_PATH;
  let tempRoot: string | null = null;
  try {
    process.env.CODEMATION_TSCONFIG_PATH = path.join(repoRoot, "tsconfig.codemation-tsx.json");
    if (savedDatabaseUrl !== undefined) {
      delete process.env.DATABASE_URL;
    }

    tempRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-db-migrate-empty-"));
    await mkdir(tempRoot, { recursive: true });
    await writeFile(path.join(tempRoot, "codemation.config.js"), "module.exports = { workflows: [] };\n", "utf8");

    const runner = new RecordingMigrationDeployer();
    const command = new DbMigrateCommand(
      new DatabaseMigrationsApplyService(
        silentLogger,
        new UserAdminConsumerDotenvLoader(),
        new ConsumerCliTsconfigPreparation(),
        new CodemationConsumerConfigLoader(),
        new ConsumerDatabaseConnectionResolver(),
        new CliDatabaseUrlDescriptor(),
        path.join(repoRoot, "packages", "host"),
        runner,
      ),
    );

    await expect(command.execute({ consumerRoot: tempRoot })).rejects.toThrow(/Database persistence is not configured/);
    expect(runner.last).toBeNull();
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { force: true, recursive: true }).catch(() => null);
    }
    if (savedDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
    if (savedTsconfig === undefined) {
      delete process.env.CODEMATION_TSCONFIG_PATH;
    } else {
      process.env.CODEMATION_TSCONFIG_PATH = savedTsconfig;
    }
    if (savedPrismaConfigPath === undefined) {
      delete process.env.CODEMATION_PRISMA_CONFIG_PATH;
    } else {
      process.env.CODEMATION_PRISMA_CONFIG_PATH = savedPrismaConfigPath;
    }
  }
});
