import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import type { Logger } from "@codemation/host/next/server";

import { DbMigrateCommand } from "../src/commands/DbMigrateCommand";
import { ConsumerCliTsconfigPreparation } from "../src/consumer/ConsumerCliTsconfigPreparation";
import { ConsumerDatabaseUrlResolver } from "../src/database/ConsumerDatabaseUrlResolver";
import type { PrismaMigrateDeployResult, PrismaMigrateDeployRunner } from "../src/database/PrismaMigrateDeployInvoker";
import { CliDatabaseUrlDescriptor } from "../src/user/CliDatabaseUrlDescriptor";
import { UserAdminConsumerDotenvLoader } from "../src/user/UserAdminConsumerDotenvLoader";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class RecordingPrismaMigrateDeployRunner implements PrismaMigrateDeployRunner {
  public last: { hostPackageRoot: string; env: NodeJS.ProcessEnv } | null = null;
  public nextStatus = 0;

  run(args: Readonly<{ hostPackageRoot: string; env: NodeJS.ProcessEnv }>): PrismaMigrateDeployResult {
    this.last = { hostPackageRoot: args.hostPackageRoot, env: { ...args.env } };
    return { status: this.nextStatus };
  }
}

test("runs prisma migrate against DATABASE_URL from the consumer .env and passes it to the invoker", async () => {
  const savedTsconfig = process.env.CODEMATION_TSCONFIG_PATH;
  const savedDatabaseUrl = process.env.DATABASE_URL;
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
    await writeFile(path.join(tempRoot, "codemation.config.js"), "module.exports = { workflows: [] };\n", "utf8");

    const runner = new RecordingPrismaMigrateDeployRunner();
    const hostRoot = path.join(repoRoot, "packages", "host");
    const command = new DbMigrateCommand(
      silentLogger,
      new UserAdminConsumerDotenvLoader(),
      new ConsumerCliTsconfigPreparation(),
      new CodemationConsumerConfigLoader(),
      new ConsumerDatabaseUrlResolver(),
      new CliDatabaseUrlDescriptor(),
      hostRoot,
      runner,
    );

    await command.execute({ consumerRoot: tempRoot });

    expect(runner.last).not.toBeNull();
    expect(runner.last?.env.DATABASE_URL).toBe("postgresql://localhost:5432/cli_migrate_fixture");
    expect(runner.last?.hostPackageRoot).toBe(hostRoot);
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
  }
});

test("throws when no database URL can be resolved", async () => {
  const savedTsconfig = process.env.CODEMATION_TSCONFIG_PATH;
  const savedDatabaseUrl = process.env.DATABASE_URL;
  let tempRoot: string | null = null;
  try {
    process.env.CODEMATION_TSCONFIG_PATH = path.join(repoRoot, "tsconfig.codemation-tsx.json");
    if (savedDatabaseUrl !== undefined) {
      delete process.env.DATABASE_URL;
    }

    tempRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-db-migrate-empty-"));
    await mkdir(tempRoot, { recursive: true });
    await writeFile(path.join(tempRoot, "codemation.config.js"), "module.exports = { workflows: [] };\n", "utf8");

    const runner = new RecordingPrismaMigrateDeployRunner();
    const command = new DbMigrateCommand(
      silentLogger,
      new UserAdminConsumerDotenvLoader(),
      new ConsumerCliTsconfigPreparation(),
      new CodemationConsumerConfigLoader(),
      new ConsumerDatabaseUrlResolver(),
      new CliDatabaseUrlDescriptor(),
      path.join(repoRoot, "packages", "host"),
      runner,
    );

    await expect(command.execute({ consumerRoot: tempRoot })).rejects.toThrow(/DATABASE_URL/);
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
  }
});
