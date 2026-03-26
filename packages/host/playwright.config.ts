import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import type { CodemationPlaywrightPreparedEnvironment } from "./test/playwright/scripts/CodemationPlaywrightEnvironmentPreparer";

const hostPackageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hostPackageRoot, "..", "..");
const preparedPath = path.join(hostPackageRoot, "test/playwright/.e2e-prepared.json");

if (!fs.existsSync(preparedPath)) {
  throw new Error(
    `Missing ${preparedPath}. Run pnpm run test:browser from @codemation/host (or pnpm exec tsx test/playwright/scripts/run-browser-e2e.ts).`,
  );
}

const prepared = JSON.parse(fs.readFileSync(preparedPath, "utf8")) as CodemationPlaywrightPreparedEnvironment;

const webServerEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ...prepared.serverEnv,
};
delete webServerEnv.REDIS_URL;

export default defineConfig({
  timeout: 120_000,
  testDir: path.join(hostPackageRoot, "test/playwright/specs"),
  globalTeardown: path.join(hostPackageRoot, "test/playwright/global-teardown.ts"),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    [
      "monocart-reporter",
      {
        name: "Codemation browser",
        outputFile: path.join(repoRoot, "coverage/raw/browser/monocart-report.html"),
        coverage: {
          outputDir: path.join(repoRoot, "coverage/raw/browser"),
          lcov: true,
          sourceFilter: (sourcePath: string) =>
            sourcePath.includes("packages/next-host/src") || sourcePath.includes("packages/host/src"),
        },
      },
    ],
  ],
  use: {
    /** Align with app URL and AUTH_URL so Auth.js cookies are not split across localhost vs 127.0.0.1. */
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    /** Production-style `next start` via CLI (not `codemation dev`). Heavy turbo + consumer build runs in CodemationPlaywrightEnvironmentPreparer so this only boots the server. */
    command: "pnpm run e2e:serve-web",
    cwd: repoRoot,
    env: webServerEnv,
    url: "http://localhost:3001",
    // Always start a fresh server so DATABASE_URL/AUTH_SECRET from `.e2e-prepared.json` match the DB that was provisioned for this run (reuse can leave a stale server on port 3001).
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
