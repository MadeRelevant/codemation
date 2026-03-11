import path from "node:path";

export const CodemationRuntimeTrackedPaths = {
  getAll(args: Readonly<{ consumerRoot: string; repoRoot: string }>): ReadonlyArray<string> {
    const { consumerRoot, repoRoot } = args;
    return [
      path.resolve(consumerRoot, "codemation.config.ts"),
      path.resolve(consumerRoot, "codemation.config.js"),
      path.resolve(consumerRoot, "src", "codemation.config.ts"),
      path.resolve(consumerRoot, "src", "codemation.config.js"),
      path.resolve(consumerRoot, ".env"),
      path.resolve(consumerRoot, ".env.local"),
      path.resolve(consumerRoot, "src"),
      path.resolve(consumerRoot, "workflows"),
      path.resolve(repoRoot, "packages", "core", "src"),
      path.resolve(repoRoot, "packages", "core-nodes", "src"),
      path.resolve(repoRoot, "packages", "frontend", "src"),
    ];
  },

  shouldTrack(targetPath: string): boolean {
    const normalizedPath = targetPath.split(path.sep).join("/");
    if (normalizedPath.endsWith("/src/routeTree.gen.ts")) {
      return false;
    }
    if (normalizedPath.endsWith("/src/router.tsx")) {
      return false;
    }
    if (normalizedPath.includes("/src/routes/")) {
      return false;
    }
    return true;
  },
} as const;
