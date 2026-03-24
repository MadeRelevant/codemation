import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PostgresIntegrationDatabase } from "../../http/testkit/PostgresIntegrationDatabase";
import { CodemationPlaywrightEnvironmentPreparer } from "./CodemationPlaywrightEnvironmentPreparer";

/**
 * Runs DB provisioning, then spawns Playwright in a child process while keeping the Postgres
 * testcontainer handle alive for the whole suite (see {@link CodemationPlaywrightEnvironmentPreparer}).
 */
export class CodemationPlaywrightBrowserSuiteRunner {
  private static e2eDatabaseHandle: PostgresIntegrationDatabase | undefined;

  static async run(): Promise<void> {
    CodemationPlaywrightBrowserSuiteRunner.e2eDatabaseHandle = await CodemationPlaywrightEnvironmentPreparer.prepare();
    const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
    const hostPackageRoot = path.resolve(scriptsDir, "..", "..", "..");
    const child = spawn("pnpm", ["exec", "playwright", "test", "-c", "playwright.config.ts"], {
      cwd: hostPackageRoot,
      stdio: "inherit",
      env: { ...process.env },
    });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("exit", (code) => {
        resolve(code ?? 1);
      });
      child.once("error", (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
    CodemationPlaywrightBrowserSuiteRunner.e2eDatabaseHandle = undefined;
    process.exit(exitCode);
  }
}
