import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const hostPackageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hostPackageRoot, "..", "..");

export default defineConfig({
  timeout: 600_000,
  testDir: path.join(hostPackageRoot, "test/playwright-scaffolded-dev/specs"),
  outputDir: path.join(hostPackageRoot, "test-results/scaffolded-dev"),
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    [
      "monocart-reporter",
      {
        name: "Codemation scaffolded dev browser",
        outputFile: path.join(repoRoot, "coverage/raw/browser-scaffolded/monocart-report.html"),
        coverage: {
          outputDir: path.join(repoRoot, "coverage/raw/browser-scaffolded"),
          lcov: true,
          sourceFilter: (sourcePath: string) =>
            sourcePath.includes("packages/create-codemation/src") ||
            sourcePath.includes("packages/cli/src") ||
            sourcePath.includes("packages/host/src") ||
            sourcePath.includes("packages/next-host/src"),
        },
      },
    ],
  ],
  use: {
    trace: "retain-on-failure",
    // Video is disabled: it requires Playwright's ffmpeg binary, and every
    // cdn.playwright.dev download hangs on CI (delivers bytes then never closes the
    // stream). trace + screenshot already cover on-failure debugging without ffmpeg.
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Use the runner's preinstalled Google Chrome (channel) instead of Playwright's
      // bundled chromium: cdn.playwright.dev deterministically hangs after the binary
      // download on CI, and the system Chrome is the same engine/version.
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
