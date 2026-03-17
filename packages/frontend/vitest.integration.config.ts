import { defineConfig } from "vitest/config";
import { frontendVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...frontendVitestSharedConfig,
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ["./test/setup.ts"],
    include: ["./test/**/*.integration.test.ts", "./test/**/*.integration.test.tsx"],
    passWithNoTests: true,
  },
});
