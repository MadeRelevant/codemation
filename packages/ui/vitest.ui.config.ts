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
    coverage: {
      // Measure all source files so uncovered primitives don't silently inflate %.
      all: true,
      include: ["src/**"],
      exclude: [
        // Pure re-export barrel — no logic to test.
        "src/index.ts",
        // One-line twMerge(clsx(...)) wrapper — trivially correct and tested transitively.
        "src/lib/cn.ts",
        // Declaration file only (lucide icon ambient types) — no runtime code.
        "src/**/*.d.ts",
        // JsonMonacoEditor wraps @monaco-editor/react which cannot be mounted in jsdom
        // (Monaco requires a real browser canvas/worker environment).
        "src/components/composite/JsonMonacoEditor.tsx",
      ],
    },
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
    alias: [{ find: "@codemation/ui", replacement: path.resolve(dirname, "./src/index.ts") }],
  },
});
