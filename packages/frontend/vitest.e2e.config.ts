import { defineConfig } from "vitest/config";
import { frontendVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...frontendVitestSharedConfig,
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    include: ["./test/**/*.e2e.test.ts", "./test/**/*.e2e.test.tsx"],
    passWithNoTests: true,
  },
});
