import path from "node:path";

export class WatchRootsResolver {
  resolve(
    args: Readonly<{
      consumerRoot: string;
      devMode: "consumer" | "framework";
      repoRoot: string;
    }>,
  ): ReadonlyArray<string> {
    if (args.devMode === "consumer") {
      return [args.consumerRoot];
    }
    return [
      args.consumerRoot,
      path.resolve(args.repoRoot, "packages", "core"),
      path.resolve(args.repoRoot, "packages", "core-nodes"),
      path.resolve(args.repoRoot, "packages", "core-nodes-gmail"),
      path.resolve(args.repoRoot, "packages", "eventbus-redis"),
      path.resolve(args.repoRoot, "packages", "host"),
      path.resolve(args.repoRoot, "packages", "node-example"),
      path.resolve(args.repoRoot, "packages", "queue-bullmq"),
      path.resolve(args.repoRoot, "packages", "run-store-sqlite"),
      path.resolve(args.repoRoot, "packages", "runtime-dev"),
    ];
  }
}
