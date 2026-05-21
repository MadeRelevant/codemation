import type { ProcessRunner } from "@codemation/host/server";

export type PrismaMigrateDeployResult = Readonly<{
  status: number | null;
}>;

export interface PrismaMigrateDeployRunner {
  run(args: Readonly<{ hostPackageRoot: string; env: NodeJS.ProcessEnv }>): PrismaMigrateDeployResult;
}

/**
 * Runs `pnpm exec prisma migrate deploy --config prisma.config.ts` in the host package
 * so the selected PostgreSQL or SQLite Prisma track is respected.
 */
export class PrismaMigrateDeployInvoker implements PrismaMigrateDeployRunner {
  constructor(private readonly processRunner: ProcessRunner) {}

  run(args: Readonly<{ hostPackageRoot: string; env: NodeJS.ProcessEnv }>): PrismaMigrateDeployResult {
    const result = this.processRunner.runSync(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy", "--config", "prisma.config.ts"],
      {
        cwd: args.hostPackageRoot,
        env: args.env,
        stdio: "inherit",
      },
    );
    return { status: result.exitCode };
  }
}
