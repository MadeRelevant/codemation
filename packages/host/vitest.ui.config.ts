import { defineConfig } from "vitest/config";
import { hostVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...hostVitestSharedConfig,
  test: {
    name: "@codemation/host-ui",
    root: import.meta.dirname,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    include: ["./test/**/*.test.tsx"],
    exclude: ["./test/**/*.integration.test.tsx"],
    passWithNoTests: true,
    pool: "threads",
    // Reuse jsdom + module graph across files (faster). Do not leak globals/mocks between files—clean up in afterEach.
    isolate: false,
    maxWorkers: 2,
    fileParallelism: true,
  },
});
