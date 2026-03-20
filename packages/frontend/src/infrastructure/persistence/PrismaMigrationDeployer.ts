import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { injectable } from "@codemation/core";

@injectable()
export class PrismaMigrationDeployer {
  private readonly require = createRequire(import.meta.url);

  async deploy(args: Readonly<{ databaseUrl: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const command = spawn(
        process.execPath,
        [this.resolvePrismaCliPath(), "migrate", "deploy", "--config", this.resolvePrismaConfigPath()],
        {
          cwd: this.resolvePackageRoot(),
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
      throw new Error("Unable to resolve the Prisma CLI required for startup migrations. Ensure `prisma` is installed.");
    }
  }

  private resolvePrismaConfigPath(): string {
    const configuredPath = process.env.CODEMATION_PRISMA_CONFIG_PATH;
    if (configuredPath) {
      return configuredPath;
    }
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "prisma.config.ts");
  }

  private resolvePackageRoot(): string {
    const configuredRoot = process.env.CODEMATION_FRONTEND_PACKAGE_ROOT;
    if (configuredRoot) {
      return configuredRoot;
    }
    // Use path.resolve instead of `new URL("../../..", import.meta.url)` so bundlers (e.g. Turbopack)
    // do not treat the segment as a module specifier.
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  }

  private createDeployError(exitCode: number | null, stdout: string, stderr: string): Error {
    const output = stderr.trim() || stdout.trim();
    if (!output) {
      return new Error(`Prisma migrate deploy failed during startup with exit code ${exitCode ?? "unknown"}.`);
    }
    return new Error(`Prisma migrate deploy failed during startup with exit code ${exitCode ?? "unknown"}.\n${output}`);
  }
}
