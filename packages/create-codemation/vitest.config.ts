import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "create-codemation",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
  },
});
