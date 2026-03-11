import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: [
      { find: "@codemation/frontend/client", replacement: path.resolve(import.meta.dirname, "./src/client.ts") },
      { find: "@codemation/frontend/server", replacement: path.resolve(import.meta.dirname, "./src/server.ts") },
      { find: "@codemation/frontend/templates", replacement: path.resolve(import.meta.dirname, "./src/templates.ts") },
      { find: "@codemation/frontend", replacement: path.resolve(import.meta.dirname, "./src/index.ts") },
      { find: "@codemation/core-nodes", replacement: path.resolve(import.meta.dirname, "../core-nodes/src/index.ts") },
      { find: "@codemation/core", replacement: path.resolve(import.meta.dirname, "../core/src/index.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
