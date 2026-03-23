import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  server: {
    deps: {
      inline: ["@monaco-editor/react"],
    },
  },
  test: {
    name: "@codemation/next-host",
    root: import.meta.dirname,
    environment: "node",
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
    pool: "threads",
    testTimeout: 60_000,
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
    alias: {
      "@": path.resolve(dirname, "./src"),
      "@codemation/host-src": path.resolve(dirname, "../host/src"),
    },
  },
});
