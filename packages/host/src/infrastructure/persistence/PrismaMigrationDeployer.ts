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
    await this.deployWithProvider({
      provider: "sqlite",
      databaseUrl: this.sqliteFilePathToDatabaseUrl(args.databaseFilePath),
      env: args.env,
    });
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
    const prismaConfigPath = this.resolveAbsolutePrismaConfigPath();
    await new Promise<void>((resolve, reject) => {
      const command = spawn(
        process.execPath,
        [this.resolvePrismaCliPath(), "migrate", "deploy", "--config", path.basename(prismaConfigPath)],
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
