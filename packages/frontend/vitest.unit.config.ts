import { defineConfig } from "vitest/config";
import { frontendVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...frontendVitestSharedConfig,
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    include: ["./test/**/*.test.ts", "./test/**/*.test.tsx"],
    exclude: ["./test/**/*.integration.test.ts", "./test/**/*.integration.test.tsx", "./test/**/*.e2e.test.ts", "./test/**/*.e2e.test.tsx"],
  },
});
