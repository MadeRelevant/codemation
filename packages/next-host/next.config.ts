import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextHostDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["ws", "bufferutil", "utf-8-validate"],
  transpilePackages: [
    "@codemation/core",
    "@codemation/core-nodes",
    "@codemation/core-nodes-gmail",
    "@codemation/eventbus-redis",
    "@codemation/frontend",
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
