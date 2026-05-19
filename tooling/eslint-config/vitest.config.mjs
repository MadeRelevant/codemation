import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/eslint-config",
    root: import.meta.dirname,
    environment: "node",
    include: ["rules/**/*.test.mjs"],
    pool: "threads",
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      // all:true ensures uncovered rule files contribute 0-hit lines and cannot silently inflate %.
      all: true,
      // Scope to custom rule implementations only; index.mjs is a pure re-export/config file
      // with no testable behaviour of its own (all its inline rules are configuration wiring, not logic).
      include: ["rules/**/*.mjs"],
      // Exclude test files themselves from coverage source.
      exclude: ["rules/**/*.test.mjs"],
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 75,
      },
    },
  },
});
