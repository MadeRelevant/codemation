import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextHostDirectory = path.dirname(fileURLToPath(import.meta.url));
const nextHostWorkspaceRoot = path.resolve(nextHostDirectory, "../..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  productionBrowserSourceMaps: true,
  /** Playwright and some browsers hit the dev server via 127.0.0.1 while Next prints localhost — silence Turbopack HMR cross-origin warnings. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  /**
   * Core / node plugins use tsyringe parameter decorators on classes. Next/Turbopack SWC cannot
   * transpile those from workspace `development` exports (`package.json` → `./src`). Prefer Node
   * loading prebuilt `dist` at runtime (no `development` condition for externals) instead of
   * bundling sources here.
   */
  serverExternalPackages: [
    "@libsql/client",
    "@prisma/adapter-libsql",
    "@codemation/core",
    "@codemation/core-nodes",
    "@codemation/core-nodes-gmail",
  ],
  transpilePackages: ["@codemation/eventbus-redis", "@codemation/host", "@codemation/node-example"],
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: nextHostWorkspaceRoot,
  },
  outputFileTracingRoot: nextHostWorkspaceRoot,
};

export default nextConfig;
