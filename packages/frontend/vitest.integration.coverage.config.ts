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
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage/integration",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/infrastructure/persistence/generated/**"],
    },
  },
});
