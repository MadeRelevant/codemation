import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { injectable } from "@codemation/core";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppPersistenceConfig } from "../../presentation/config/AppConfig";

/**
 * Runs `prisma migrate deploy` against TCP PostgreSQL or against a PGlite data directory
 * by temporarily exposing PGlite on a local Postgres protocol socket (see `@electric-sql/pglite-socket`).
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
    await this.deployPgliteViaPrismaCli({ dataDir: persistence.dataDir, env });
  }

  async deploy(args: Readonly<{ databaseUrl: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<void> {
    await this.deployPostgres(args);
  }

  private async deployPgliteViaPrismaCli(
    args: Readonly<{ dataDir: string; env?: Readonly<NodeJS.ProcessEnv> }>,
  ): Promise<void> {
    await this.ensurePgliteParentDirectoryExists(args.dataDir);
    let pglite: PGlite;
    try {
      pglite = new PGlite(args.dataDir);
      await pglite.waitReady;
    } catch (cause) {
      throw this.createPgliteOpenFailureError(args.dataDir, cause);
    }
    const server = new PGLiteSocketServer({
      db: pglite,
      port: 0,
      host: "127.0.0.1",
      // Prisma migrate may use multiple connections; default maxConnections is 1.
      maxConnections: 32,
    });
    await server.start();
    try {
      const databaseUrl = this.pgliteSocketConnectionToPostgresUrl(server.getServerConn());
      await this.deployPostgres({ databaseUrl, env: args.env });
    } finally {
      await server.stop();
      await pglite.close();
    }
  }

  private async deployPostgres(
    args: Readonly<{ databaseUrl: string; env?: Readonly<NodeJS.ProcessEnv> }>,
  ): Promise<void> {
    const prismaConfigPath = this.resolveAbsolutePrismaConfigPath();
    await new Promise<void>((resolve, reject) => {
      const command = spawn(
        process.execPath,
        [this.resolvePrismaCliPath(), "migrate", "deploy", "--config", path.basename(prismaConfigPath)],
        {
          cwd: path.dirname(prismaConfigPath),
          env: this.createProcessEnvironment(args.databaseUrl, args.env),
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

  /**
   * {@link PGLiteSocketServer.getServerConn} returns `host:port` or a unix socket path — Prisma requires a `postgresql://` URL.
   * The query engine expects `sslmode=disable` on this loopback socket and a user (PGlite accepts `postgres`).
   */
  private pgliteSocketConnectionToPostgresUrl(raw: string): string {
    if (raw.startsWith("postgresql://") || raw.startsWith("postgres://")) {
      return raw.includes("sslmode=") ? raw : `${raw}${raw.includes("?") ? "&" : "?"}sslmode=disable`;
    }
    if (raw.startsWith("/")) {
      return `postgresql://postgres@localhost/postgres?host=${encodeURIComponent(raw)}&sslmode=disable`;
    }
    const colon = raw.lastIndexOf(":");
    if (colon <= 0 || colon === raw.length - 1) {
      throw new Error(`Unexpected PGlite socket connection string: ${raw}`);
    }
    const host = raw.slice(0, colon);
    const port = raw.slice(colon + 1);
    return `postgresql://postgres@${host}:${port}/postgres?sslmode=disable`;
  }

  private createProcessEnvironment(databaseUrl: string, env?: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...(env ?? {}),
      DATABASE_URL: databaseUrl,
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
      if (existsSync(path.join(currentDirectory, "prisma", "schema.prisma"))) {
        return currentDirectory;
      }
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        break;
      }
      currentDirectory = parentDirectory;
    }
    throw new Error(`Could not locate prisma/schema.prisma near ${fileURLToPath(import.meta.url)}.`);
  }

  private async ensurePgliteParentDirectoryExists(dataDir: string): Promise<void> {
    await mkdir(path.dirname(dataDir), { recursive: true });
  }

  private createPgliteOpenFailureError(dataDir: string, cause: unknown): Error {
    const underlying = cause instanceof Error ? cause.message : String(cause);
    return new Error(
      [
        `PGlite could not open "${dataDir}".`,
        "Embedded PGlite files are sometimes left in a bad state after a crash, kill -9, or interrupted migration.",
        "If this is a dev database you can recreate, delete that directory and run again.",
        `Underlying error: ${underlying}`,
      ].join(" "),
      { cause: cause instanceof Error ? cause : undefined },
    );
  }

  private createDeployError(exitCode: number | null, stdout: string, stderr: string): Error {
    const output = stderr.trim() || stdout.trim();
    if (!output) {
      return new Error(`Prisma migrate deploy failed during startup with exit code ${exitCode ?? "unknown"}.`);
    }
    return new Error(`Prisma migrate deploy failed during startup with exit code ${exitCode ?? "unknown"}.\n${output}`);
  }
}
