import { spawnSync } from "node:child_process";

export type PrismaMigrateDeployResult = Readonly<{
  status: number | null;
}>;

export interface PrismaMigrateDeployRunner {
  run(args: Readonly<{ hostPackageRoot: string; env: NodeJS.ProcessEnv }>): PrismaMigrateDeployResult;
}

/**
 * Runs `pnpm exec prisma migrate deploy` in the host package (where the Prisma schema lives).
 */
export class PrismaMigrateDeployInvoker implements PrismaMigrateDeployRunner {
  run(args: Readonly<{ hostPackageRoot: string; env: NodeJS.ProcessEnv }>): PrismaMigrateDeployResult {
    const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: args.hostPackageRoot,
      env: args.env,
      stdio: "inherit",
      shell: false,
    });
    return { status: result.status };
  }
}
