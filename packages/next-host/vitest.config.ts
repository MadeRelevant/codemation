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
    alias: [
      { find: "@codemation/canvas", replacement: path.resolve(dirname, "../canvas/src/index.ts") },
      { find: /^@codemation\/next-host\/src\/(.*)$/, replacement: path.resolve(dirname, "./src/$1") },
      { find: "@", replacement: path.resolve(dirname, "./src") },
      {
        find: "@codemation/host/dto",
        replacement: path.resolve(dirname, "../host/src/dto.ts"),
      },
      {
        find: "@codemation/host/client",
        replacement: path.resolve(dirname, "../host/src/client.ts"),
      },
      {
        find: "@codemation/host/mapping",
        replacement: path.resolve(dirname, "../host/src/mapping.ts"),
      },
      {
        find: "@codemation/core/contracts",
        replacement: path.resolve(dirname, "../core/src/contracts.ts"),
      },
      {
        find: "@codemation/core/browser",
        replacement: path.resolve(dirname, "../core/src/browser.ts"),
      },
    ],
  },
});
