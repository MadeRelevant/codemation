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
    try {
      return this.require.resolve("prisma/build/index.js");
    } catch {
      throw new Error("Unable to resolve the Prisma CLI required for startup migrations. Ensure `prisma` is installed.");
    }
  }

  private resolvePrismaConfigPath(): string {
    return fileURLToPath(new URL("../../../prisma.config.ts", import.meta.url));
  }

  private resolvePackageRoot(): string {
    return fileURLToPath(new URL("../../..", import.meta.url));
  }

  private createDeployError(exitCode: number | null, stdout: string, stderr: string): Error {
    const output = stderr.trim() || stdout.trim();
    if (!output) {
      return new Error(`Prisma migrate deploy failed during startup with exit code ${exitCode ?? "unknown"}.`);
    }
    return new Error(`Prisma migrate deploy failed during startup with exit code ${exitCode ?? "unknown"}.\n${output}`);
  }
}
