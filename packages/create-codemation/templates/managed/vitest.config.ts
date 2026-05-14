import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "codemation-managed-workspace",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
