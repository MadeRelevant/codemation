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
    name: "@codemation/canvas:ui",
    root: import.meta.dirname,
    environment: "jsdom",
    include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    pool: "threads",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        // ReactFlow edge primitives — require full ReactFlow SVG context to render; visual-only
        "src/canvas/WorkflowCanvasStraightCountEdge.tsx",
        "src/canvas/WorkflowCanvasSymmetricForkEdge.tsx",
        "src/canvas/WorkflowCanvasSimpleIconGlyph.tsx",
      ],
    },
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
    alias: [
      { find: "@codemation/canvas", replacement: path.resolve(dirname, "./src/index.ts") },
      { find: "@codemation/canvas-core", replacement: path.resolve(dirname, "../canvas-core/src/index.ts") },
    ],
  },
});
