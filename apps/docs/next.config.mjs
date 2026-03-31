import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";

const docsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(docsDirectory, "../..");
const withMDX = createMDX();

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: workspaceRoot,
  },
  outputFileTracingRoot: workspaceRoot,
};

export default withMDX(nextConfig);
