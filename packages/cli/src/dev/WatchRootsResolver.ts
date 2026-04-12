import path from "node:path";

import { WorkspacePluginPackageResolver, type WorkspacePluginPackageLookup } from "./WorkspacePluginPackageResolver";

export class WatchRootsResolver {
  constructor(
    private readonly workspacePluginPackageResolver: WorkspacePluginPackageLookup = new WorkspacePluginPackageResolver(),
  ) {}

  async resolve(
    args: Readonly<{
      consumerRoot: string;
      devMode: "packaged-ui" | "watch-framework";
      repoRoot: string;
    }>,
  ): Promise<ReadonlyArray<string>> {
    if (args.devMode === "packaged-ui") {
      // Packaged UI mode watches only the app itself. Framework packages are consumed from their built output.
      return [args.consumerRoot];
    }
    const workspacePluginPackages = await this.workspacePluginPackageResolver.resolve({
      consumerRoot: args.consumerRoot,
      repoRoot: args.repoRoot,
    });
    // Watch-framework mode is framework-author development: watch the app plus the workspace packages that
    // feed the consumer output and packaged Next host. Plugin packages stay aligned with packaged behavior by
    // watching their built entry roots instead of their source roots.
    return [
      args.consumerRoot,
      path.resolve(args.repoRoot, "packages", "cli"),
      path.resolve(args.repoRoot, "packages", "core"),
      path.resolve(args.repoRoot, "packages", "core-nodes"),
      path.resolve(args.repoRoot, "packages", "eventbus-redis"),
      path.resolve(args.repoRoot, "packages", "host"),
      path.resolve(args.repoRoot, "packages", "node-example"),
      ...workspacePluginPackages.map((workspacePluginPackage) => workspacePluginPackage.watchRoot),
    ];
  }
}
