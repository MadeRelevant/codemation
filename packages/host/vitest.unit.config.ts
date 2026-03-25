import { defineConfig } from "vitest/config";
import { hostVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...hostVitestSharedConfig,
  test: {
    name: "@codemation/host-unit",
    root: import.meta.dirname,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    include: ["./test/**/*.test.ts"],
    exclude: ["./test/**/*.integration.test.ts", "./test/http/**", "./test/**/*.e2e.test.ts"],
    passWithNoTests: true,
    pool: "threads",
    isolate: true,
    maxWorkers: 2,
    fileParallelism: true,
  },
});
