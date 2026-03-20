import { defineConfig } from "vitest/config";
import { frontendVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...frontendVitestSharedConfig,
  test: {
    name: "@codemation/frontend-ui",
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
