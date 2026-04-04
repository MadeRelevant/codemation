import { spawnSync } from "node:child_process";

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
  run(args: Readonly<{ hostPackageRoot: string; env: NodeJS.ProcessEnv }>): PrismaMigrateDeployResult {
    const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy", "--config", "prisma.config.ts"], {
      cwd: args.hostPackageRoot,
      env: args.env,
      stdio: "inherit",
      shell: false,
    });
    return { status: result.status };
  }
}
