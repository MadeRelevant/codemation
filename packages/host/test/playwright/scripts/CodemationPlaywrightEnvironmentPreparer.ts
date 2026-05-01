import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
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
  /**
   * Playwright browser tests are bootstrapped via {@code run-codemation-tsx.mjs}, which appends
   * {@code --conditions=development} to {@code NODE_OPTIONS} for tsx. Turbo / consumer builds must
   * not inherit that flag or resolution can diverge from CI and fail the preparer build step.
   */
  private static toolingProcessEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    const raw = env.NODE_OPTIONS;
    if (typeof raw === "string" && raw.trim().length > 0) {
      const cleaned = raw
        .split(/\s+/u)
        .filter((token) => token.length > 0 && !token.startsWith("--conditions="))
        .join(" ")
        .trim();
      if (cleaned.length > 0) {
        env.NODE_OPTIONS = cleaned;
      } else {
        delete env.NODE_OPTIONS;
      }
    }
    return env;
  }

  private static async pickServerBaseUrl(): Promise<Readonly<{ baseUrl: string; port: string }>> {
    const preferred = 3001;
    const preferredAvailable = await this.isPortAvailable(preferred);
    if (preferredAvailable) {
      return { baseUrl: `http://localhost:${preferred}`, port: String(preferred) };
    }
    const ephemeral = await this.allocateEphemeralPort();
    return { baseUrl: `http://localhost:${ephemeral}`, port: String(ephemeral) };
  }

  private static async isPortAvailable(port: number): Promise<boolean> {
    const server = net.createServer();
    return await new Promise<boolean>((resolve) => {
      server.once("error", () => {
        resolve(false);
      });
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    });
  }

  private static async allocateEphemeralPort(): Promise<number> {
    const server = net.createServer();
    return await new Promise<number>((resolve, reject) => {
      server.once("error", (e) => {
        reject(e instanceof Error ? e : new Error(String(e)));
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close(() => reject(new Error("Failed to allocate an ephemeral TCP port.")));
          return;
        }
        const { port } = address;
        server.close(() => resolve(port));
      });
    });
  }

  static async prepare(): Promise<PostgresIntegrationDatabase> {
    const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
    const hostPackageRoot = path.resolve(scriptsDir, "..", "..", "..");
    const repoRoot = path.resolve(hostPackageRoot, "../..");
    const snapshotPath = path.join(hostPackageRoot, "test/playwright/.e2e-db-snapshot.json");
    const preparedPath = path.join(hostPackageRoot, "test/playwright/.e2e-prepared.json");

    const database = await PostgresIntegrationDatabase.create();
    fs.rmSync(path.join(repoRoot, "apps/e2e/.codemation/dev.lock"), { force: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(database.serialize()), "utf8");

    const buildEnv = {
      ...CodemationPlaywrightEnvironmentPreparer.toolingProcessEnv(),
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
        "apps/e2e",
      ],
      {
        cwd: repoRoot,
        env: buildEnv,
        stdio: "inherit",
      },
    );
    if (userCreate.status !== 0) {
      throw new Error(`codemation user create failed with exit code ${userCreate.status ?? "unknown"}.`);
    }
    const consumerBuild = spawnSync("pnpm", ["--filter", "@codemation/e2e-app", "exec", "codemation", "build"], {
      cwd: repoRoot,
      env: buildEnv,
      stdio: "inherit",
    });
    if (consumerBuild.status !== 0) {
      throw new Error(`codemation build for browser E2E failed with exit code ${consumerBuild.status ?? "unknown"}.`);
    }

    const { baseUrl, port } = await this.pickServerBaseUrl();
    const serverEnv: Record<string, string> = {
      DATABASE_URL: database.databaseUrl,
      AUTH_SECRET: authSecret,
      /** Must match Playwright `baseURL` so server-side URL resolution uses the browser origin. */
      AUTH_URL: baseUrl,
      NEXTAUTH_URL: baseUrl,
      CODEMATION_PUBLIC_BASE_URL: baseUrl,
      PORT: port,
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
