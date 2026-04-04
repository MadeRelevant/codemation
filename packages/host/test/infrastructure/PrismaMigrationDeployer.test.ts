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

  resolve(...segments: string[]): string {
    return path.join(this.root, ...segments);
  }
}

describe("PrismaMigrationDeployer", () => {
  it("creates the parent directory for a new SQLite database file", async () => {
    const fixture = await PrismaMigrationDeployerTestFixture.create("codemation-sqlite-parent-");
    try {
      const databaseFilePath = fixture.resolve(".codemation", "codemation.sqlite");
      const deployer = new PrismaMigrationDeployer();
      await deployer.deployPersistence({ kind: "sqlite", databaseFilePath }, process.env);
      await access(fixture.resolve(".codemation"));
      await access(databaseFilePath);
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
});
