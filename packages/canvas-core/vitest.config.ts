import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/canvas-core",
    root: import.meta.dirname,
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    pool: "threads",
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
