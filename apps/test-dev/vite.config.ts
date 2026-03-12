import { defineConfig } from "vite";
import path from "node:path";
import viteTsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  resolve: {
    alias: {
      "@codemation/core": path.resolve(import.meta.dirname, "../../packages/core/dist/index.js"),
      "@codemation/core-nodes": path.resolve(import.meta.dirname, "../../packages/core-nodes/dist/index.js"),
      "@codemation/node-example": path.resolve(import.meta.dirname, "../../packages/node-example/dist/index.js"),
      "@codemation/queue-bullmq": path.resolve(import.meta.dirname, "../../packages/queue-bullmq/dist/index.js"),
      "@codemation/run-store-sqlite": path.resolve(import.meta.dirname, "../../packages/run-store-sqlite/dist/index.js"),
      "@codemation/eventbus-redis": path.resolve(import.meta.dirname, "../../packages/eventbus-redis/dist/index.js"),
    },
  },
  plugins: [
    viteTsconfigPaths(),
    tanstackStart(),
    viteReact(),
  ],
});
