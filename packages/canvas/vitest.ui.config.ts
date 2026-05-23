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
      // Measure all source files so uncovered primitives don't silently inflate %.
      all: true,
      provider: "v8",
      include: ["src/**"],
      exclude: [
        // Pure re-export barrel — no logic to test.
        "src/index.ts",
        // Declaration file only (lucide icon ambient types) — no runtime code.
        "src/**/*.d.ts",
        // ReactFlow edge primitives — require full ReactFlow SVG context to render; visual-only.
        "src/canvas/WorkflowCanvasStraightCountEdge.tsx",
        "src/canvas/WorkflowCanvasSymmetricForkEdge.tsx",
        "src/canvas/WorkflowCanvasSimpleIconGlyph.tsx",
        // WorkflowCanvas is the ReactFlow root — requires ReactFlowProvider + real measured
        // dimensions (ResizeObserver + clientWidth) that jsdom cannot provide.
        "src/canvas/WorkflowCanvas.tsx",
        // WorkflowCanvasCodemationNode and its Handle-bearing children require @xyflow/react's
        // Zustand context (ReactFlow provider) which cannot be set up in jsdom without a full
        // ReactFlow mount; all observable node behavior is covered via child component tests.
        "src/canvas/WorkflowCanvasCodemationNode.tsx",
        "src/canvas/WorkflowCanvasCodemationNodeHandles.tsx",
        "src/canvas/WorkflowCanvasCodemationNodeAgentBottomSourceHandles.tsx",
        // WorkflowRealtimeProvider wraps a WebSocket-based hook that requires a real network
        // environment — untestable in jsdom without a full mock socket server.
        "src/components/realtime/WorkflowRealtimeProvider.tsx",
        // WorkflowCanvasLucideRemoteGlyph issues a CSS mask-image fetch to /api/lucide-icon/
        // that is only meaningful in a real browser with a running host; the icon resolution
        // path is covered transitively via WorkflowCanvasNodeIcon tests.
        "src/canvas/WorkflowCanvasLucideRemoteGlyph.tsx",
        // WorkflowJsonEditorDialog embeds JsonMonacoEditor (Monaco Editor) which requires a
        // real browser canvas/worker environment — untestable in jsdom.
        "src/panels/WorkflowJsonEditorDialog.tsx",
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
