import path from "node:path";

const hostSrc = path.resolve(import.meta.dirname, "./src");
const nextHostSrc = path.resolve(import.meta.dirname, "../next-host/src");

export const hostVitestSharedConfig = {
  esbuild: {
    jsx: "automatic" as const,
    jsxImportSource: "react",
  },
  resolve: {
    alias: [
      { find: "@codemation/core/browser", replacement: path.resolve(import.meta.dirname, "../core/src/browser.ts") },
      { find: /^@codemation\/host-src\/(.+)$/, replacement: `${hostSrc}/$1` },
      { find: /^@codemation\/next-host\/src\/(.+)$/, replacement: `${nextHostSrc}/$1` },
      { find: "@codemation/host/client", replacement: path.resolve(import.meta.dirname, "./src/client.ts") },
      { find: "@codemation/host/server", replacement: path.resolve(import.meta.dirname, "./src/server.ts") },
      {
        find: "@codemation/host/persistence",
        replacement: path.resolve(import.meta.dirname, "./src/persistenceServer.ts"),
      },
      { find: "@codemation/host", replacement: path.resolve(import.meta.dirname, "./src/index.ts") },
      { find: "@codemation/core-nodes", replacement: path.resolve(import.meta.dirname, "../core-nodes/src/index.ts") },
      {
        find: "@codemation/queue-bullmq",
        replacement: path.resolve(import.meta.dirname, "../queue-bullmq/src/index.ts"),
      },
      {
        find: "@codemation/eventbus-redis",
        replacement: path.resolve(import.meta.dirname, "../eventbus-redis/src/index.ts"),
      },
      { find: "@codemation/core/testing", replacement: path.resolve(import.meta.dirname, "../core/src/testing.ts") },
      { find: "@codemation/core", replacement: path.resolve(import.meta.dirname, "../core/src/index.ts") },
      {
        find: "next/navigation",
        replacement: path.resolve(import.meta.dirname, "./test/nextNavigationStub.ts"),
      },
      { find: /^@\//, replacement: `${nextHostSrc}/` },
    ],
  },
};
