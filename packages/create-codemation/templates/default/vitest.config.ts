import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "codemation-app",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
