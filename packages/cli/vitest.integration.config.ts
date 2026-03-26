import path from "node:path";
import { defineConfig } from "vitest/config";

const hostPackageRoot = path.resolve(import.meta.dirname, "../host");

export default defineConfig({
  test: {
    name: "@codemation/cli-integration",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.integration.test.ts"],
    pool: "threads",
    testTimeout: 180_000,
    hookTimeout: 180_000,
    isolate: true,
    globalSetup: [
      path.join(hostPackageRoot, "scripts/ensure-prisma-runtime-sourcemaps.mjs"),
      path.join(hostPackageRoot, "scripts/integration-database-global-setup.mjs"),
    ],
    setupFiles: [path.join(hostPackageRoot, "test/integration/loadSharedIntegrationDatabaseEnv.ts")],
  },
});
