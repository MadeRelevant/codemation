import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import { WatchRootsResolver } from "../src/dev/WatchRootsResolver";
import type { WorkspacePluginPackage } from "../src/dev/WorkspacePluginPackageResolver";

class FakeWorkspacePluginPackageResolver {
  constructor(private readonly packages: ReadonlyArray<WorkspacePluginPackage>) {}

  async resolve(): Promise<ReadonlyArray<WorkspacePluginPackage>> {
    return this.packages;
  }
}

test("WatchRootsResolver keeps packaged UI mode scoped to the consumer root", async () => {
  const consumerRoot = "/tmp/my-automation";
  const repoRoot = "/workspace/codemation";

  assert.deepEqual(await new WatchRootsResolver().resolve({ consumerRoot, devMode: "packaged-ui", repoRoot }), [
    consumerRoot,
  ]);
});

test("WatchRootsResolver includes framework source packages plus plugin dist roots when watch-framework is enabled", async () => {
  const consumerRoot = "/tmp/my-automation";
  const repoRoot = "/workspace/codemation";
  const resolver = new FakeWorkspacePluginPackageResolver([
    {
      packageName: "@codemation/core-nodes-gmail",
      packageRoot: path.resolve(repoRoot, "packages", "core-nodes-gmail"),
      pluginEntryPath: path.resolve(repoRoot, "packages", "core-nodes-gmail", "dist", "codemation.plugin.js"),
      watchRoot: path.resolve(repoRoot, "packages", "core-nodes-gmail", "dist"),
    },
  ]);

  assert.deepEqual(
    await new WatchRootsResolver(resolver).resolve({ consumerRoot, devMode: "watch-framework", repoRoot }),
    [
      consumerRoot,
      path.resolve(repoRoot, "packages", "cli"),
      path.resolve(repoRoot, "packages", "core"),
      path.resolve(repoRoot, "packages", "core-nodes"),
      path.resolve(repoRoot, "packages", "eventbus-redis"),
      path.resolve(repoRoot, "packages", "host"),
      path.resolve(repoRoot, "packages", "node-example"),
      path.resolve(repoRoot, "packages", "core-nodes-gmail", "dist"),
    ],
  );
});
