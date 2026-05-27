import path from "node:path";
import { defineConfig } from "vitest/config";

const hostPackageRoot = path.resolve(import.meta.dirname, "../host");

export default defineConfig({
  // `development` exports condition makes Vitest load `@codemation/host` from
  // source (mirrors the unit config). Without it the integration suite picks
  // the `import` condition (dist) and dynamic imports from the source wrapper
  // can no longer find the lazy operations module under `src/`.
  resolve: {
    conditions: ["development"],
  },
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
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/**/*.types.ts", "src/bin.ts"],
    },
  },
});
