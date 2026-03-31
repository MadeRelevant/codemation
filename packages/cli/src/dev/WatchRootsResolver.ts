import path from "node:path";

export class WatchRootsResolver {
  resolve(
    args: Readonly<{
      consumerRoot: string;
      devMode: "packaged-ui" | "watch-framework";
      repoRoot: string;
    }>,
  ): ReadonlyArray<string> {
    if (args.devMode === "packaged-ui") {
      // Packaged UI mode watches only the app itself. Framework packages are consumed from their built output.
      return [args.consumerRoot];
    }
    // Watch-framework mode is framework-author development: watch the app plus the workspace packages that
    // feed the consumer output and packaged Next host.
    return [
      args.consumerRoot,
      path.resolve(args.repoRoot, "packages", "cli"),
      path.resolve(args.repoRoot, "packages", "core"),
      path.resolve(args.repoRoot, "packages", "core-nodes"),
      path.resolve(args.repoRoot, "packages", "core-nodes-gmail"),
      path.resolve(args.repoRoot, "packages", "eventbus-redis"),
      path.resolve(args.repoRoot, "packages", "host"),
      path.resolve(args.repoRoot, "packages", "node-example"),
    ];
  }
}
