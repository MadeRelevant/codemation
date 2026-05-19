import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    name: "@codemation/ui:ui",
    root: import.meta.dirname,
    environment: "jsdom",
    include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    pool: "threads",
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
    alias: [{ find: "@codemation/ui", replacement: path.resolve(dirname, "./src/index.ts") }],
  },
});
