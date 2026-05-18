import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    name: "@codemation/canvas-core",
    root: import.meta.dirname,
    // jsdom is required for hook tests (@testing-library/react).
    // Pure canvas-lib tests (no DOM needed) still work fine in jsdom.
    environment: "jsdom",
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "test/**/*.test.tsx"],
    pool: "threads",
    coverage: {
      provider: "v8",
      // Scope to canvas-lib only (pure logic; hooks/ excluded from the threshold gate).
      include: ["src/canvas-lib/**/*.ts"],
      exclude: ["src/canvas-lib/elk/**/*.ts"],
      thresholds: {
        lines: 65,
        functions: 80,
        branches: 50,
      },
    },
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
