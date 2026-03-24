import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextHostDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Playwright and some browsers hit the dev server via 127.0.0.1 while Next prints localhost — silence Turbopack HMR cross-origin warnings. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["ws", "bufferutil", "utf-8-validate"],
  transpilePackages: [
    "@codemation/core",
    "@codemation/core-nodes",
    "@codemation/core-nodes-gmail",
    "@codemation/eventbus-redis",
    "@codemation/host",
    "@codemation/node-example",
    "@codemation/queue-bullmq",
    "@codemation/run-store-sqlite",
  ],
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: path.resolve(nextHostDirectory, "../.."),
};

export default nextConfig;
