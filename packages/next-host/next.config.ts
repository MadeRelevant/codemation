import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bundleAnalyzer from "@next/bundle-analyzer";

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
  serverExternalPackages: ["@libsql/client", "@prisma/adapter-libsql", "@codemation/core", "@codemation/core-nodes"],
  transpilePackages: [
    "@codemation/canvas",
    "@codemation/canvas-core",
    "@codemation/eventbus-redis",
    "@codemation/host",
    "@codemation/node-example",
  ],
  experimental: {
    externalDir: true,
    // Per the Phase-1 deep diagnostic: lucide-react ships 1,967 individual icon files (46 MB)
    // and recharts ships 260 ES6 barrel files (1.8 MB). Without this, Turbopack walks the
    // full barrel of every listed package on every UI route compile — driving the workflow
    // detail page's RSS peak past 5 GB. With it, SWC rewrites `import { Plus } from "lucide-react"`
    // into a direct deep import of just that icon's file, so Turbopack only walks what's
    // actually used. Re-evaluate this list when adding heavy npm deps.
    optimizePackageImports: [
      "lucide-react",
      "simple-icons",
      "recharts",
      "@tanstack/react-query",
      "react-hook-form",
      "@uiw/react-json-view",
      "@headless-tree/react",
      "@headless-tree/core",
      "date-fns",
      "radix-ui",
    ],
  },
  turbopack: {
    root: nextHostWorkspaceRoot,
  },
  outputFileTracingRoot: nextHostWorkspaceRoot,
  // lucide-static is only loaded dynamically via createRequire in lucideIconGet.ts.
  // Next.js's static file-tracing pass can't see that, so the standalone build
  // omits the package and every /api/lucide-icon/<name>.svg request 404s in
  // production / packaged-dev mode. Force-include the icons directory + package.json.
  // Both the dedicated route and the catch-all guard need the trace.
  outputFileTracingIncludes: {
    "/api/lucide-icon/[name]": [
      "./node_modules/lucide-static/icons/*.svg",
      "./node_modules/lucide-static/package.json",
    ],
    "/api/{**}": ["./node_modules/lucide-static/icons/*.svg", "./node_modules/lucide-static/package.json"],
  },
};

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
