import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/core",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/execution/**/*.ts", "src/planning/**/*.ts", "src/scheduler/**/*.ts"],
      exclude: [
        "**/index.ts",
        "**/*.types.ts",
        "**/types/index.ts",
        "src/execution/index.ts",
        "src/planning/index.ts",
        "src/scheduler/index.ts",
        "src/execution/NodeRunStateWriter.ts",
        "src/execution/NodeRunStateWriterFactory.ts",
      ],
      /** Engine gate: execution/scheduling/planning should stay ≥90%. */
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 75,
      },
    },
  },
});
