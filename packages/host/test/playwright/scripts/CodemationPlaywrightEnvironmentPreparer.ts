import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresIntegrationDatabase } from "../../http/testkit/PostgresIntegrationDatabase";

const authSecret = "codemation-playwright-e2e-auth-secret-min-32-chars";

export type CodemationPlaywrightPreparedEnvironment = Readonly<{
  /** String-only env merged with `process.env` in playwright.config.ts for webServer. */
  serverEnv: Readonly<Record<string, string>>;
}>;

/**
 * Provisions PostgreSQL, creates the e2e user, and writes files consumed by playwright.config.ts
 * and global-teardown.
 *
 * Returns the live {@link PostgresIntegrationDatabase} handle so callers can keep a reference
 * until Playwright finishes — testcontainers may tear down Docker Postgres when the preparing
 * process exits before the web server is done (Ryuk / session cleanup).
 */
export class CodemationPlaywrightEnvironmentPreparer {
  static async prepare(): Promise<PostgresIntegrationDatabase> {
    const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
    const hostPackageRoot = path.resolve(scriptsDir, "..", "..", "..");
    const repoRoot = path.resolve(hostPackageRoot, "../..");
    const snapshotPath = path.join(hostPackageRoot, "test/playwright/.e2e-db-snapshot.json");
    const preparedPath = path.join(hostPackageRoot, "test/playwright/.e2e-prepared.json");

    const database = await PostgresIntegrationDatabase.create();
    fs.rmSync(path.join(repoRoot, "packages/e2e/.codemation/dev.lock"), { force: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(database.serialize()), "utf8");

    const userCreate = spawnSync(
      "pnpm",
      [
        "codemation",
        "user",
        "create",
        "--email",
        "e2e@codemation.test",
        "--password",
        "E2E-test-password-1!",
        "--consumer-root",
        "packages/e2e",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATABASE_URL: database.databaseUrl,
          AUTH_SECRET: authSecret,
          REDIS_URL: "",
          CODEMATION_E2E_FORCE_LOCAL_RUNTIME: "1",
          CODEMATION_TSCONFIG_PATH: path.join(repoRoot, "tsconfig.base.json"),
        },
        stdio: "inherit",
      },
    );
    if (userCreate.status !== 0) {
      throw new Error(`codemation user create failed with exit code ${userCreate.status ?? "unknown"}.`);
    }

    const buildEnv = {
      ...process.env,
      DATABASE_URL: database.databaseUrl,
      AUTH_SECRET: authSecret,
      REDIS_URL: "",
      CODEMATION_E2E_FORCE_LOCAL_RUNTIME: "1",
      CODEMATION_TSCONFIG_PATH: path.join(repoRoot, "tsconfig.base.json"),
    };
    const turboBuild = spawnSync(
      "pnpm",
      ["exec", "turbo", "run", "build", "--filter=@codemation/e2e-app...", "--filter=!@codemation/eslint-config"],
      {
        cwd: repoRoot,
        env: buildEnv,
        stdio: "inherit",
      },
    );
    if (turboBuild.status !== 0) {
      throw new Error(`turbo build for browser E2E failed with exit code ${turboBuild.status ?? "unknown"}.`);
    }
    const consumerBuild = spawnSync("pnpm", ["--filter", "@codemation/e2e-app", "exec", "codemation", "build"], {
      cwd: repoRoot,
      env: buildEnv,
      stdio: "inherit",
    });
    if (consumerBuild.status !== 0) {
      throw new Error(`codemation build for browser E2E failed with exit code ${consumerBuild.status ?? "unknown"}.`);
    }

    const serverEnv: Record<string, string> = {
      DATABASE_URL: database.databaseUrl,
      AUTH_SECRET: authSecret,
      /** Must match Playwright `baseURL` so Auth.js session cookies align with the browser origin (127.0.0.1 vs localhost breaks cookies + middleware). */
      AUTH_URL: "http://localhost:3001",
      NEXTAUTH_URL: "http://localhost:3001",
      PORT: "3001",
      REDIS_URL: "",
      CODEMATION_E2E_FORCE_LOCAL_RUNTIME: "1",
      CODEMATION_TSCONFIG_PATH: path.join(repoRoot, "tsconfig.base.json"),
    };

    const payload: CodemationPlaywrightPreparedEnvironment = {
      serverEnv,
    };
    fs.writeFileSync(preparedPath, JSON.stringify(payload, null, 2), "utf8");
    return database;
  }
}
