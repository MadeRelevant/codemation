import path from "node:path";

export const frontendVitestSharedConfig = {
  esbuild: {
    jsx: "automatic" as const,
    jsxImportSource: "react",
  },
  resolve: {
    alias: [
      { find: "@codemation/core/browser", replacement: path.resolve(import.meta.dirname, "../core/src/browser.ts") },
      { find: "@codemation/frontend/client", replacement: path.resolve(import.meta.dirname, "./src/client.ts") },
      { find: "@codemation/frontend/server", replacement: path.resolve(import.meta.dirname, "./src/server.ts") },
      { find: "@codemation/frontend", replacement: path.resolve(import.meta.dirname, "./src/index.ts") },
      { find: "@codemation/core-nodes", replacement: path.resolve(import.meta.dirname, "../core-nodes/src/index.ts") },
      { find: "@codemation/queue-bullmq", replacement: path.resolve(import.meta.dirname, "../queue-bullmq/src/index.ts") },
      { find: "@codemation/eventbus-redis", replacement: path.resolve(import.meta.dirname, "../eventbus-redis/src/index.ts") },
      { find: "@codemation/core", replacement: path.resolve(import.meta.dirname, "../core/src/index.ts") },
    ],
  },
};
