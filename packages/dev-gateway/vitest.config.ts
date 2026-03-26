import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/dev-gateway",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    isolate: true,
    maxWorkers: 2,
    fileParallelism: true,
  },
});
