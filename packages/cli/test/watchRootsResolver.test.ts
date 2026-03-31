import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import { WatchRootsResolver } from "../src/dev/WatchRootsResolver";

test("WatchRootsResolver keeps packaged UI mode scoped to the consumer root", () => {
  const consumerRoot = "/tmp/my-automation";
  const repoRoot = "/workspace/codemation";

  assert.deepEqual(new WatchRootsResolver().resolve({ consumerRoot, devMode: "packaged-ui", repoRoot }), [
    consumerRoot,
  ]);
});

test("WatchRootsResolver includes framework packages when watch-framework is enabled", () => {
  const consumerRoot = "/tmp/my-automation";
  const repoRoot = "/workspace/codemation";

  assert.deepEqual(new WatchRootsResolver().resolve({ consumerRoot, devMode: "watch-framework", repoRoot }), [
    consumerRoot,
    path.resolve(repoRoot, "packages", "core"),
    path.resolve(repoRoot, "packages", "core-nodes"),
    path.resolve(repoRoot, "packages", "core-nodes-gmail"),
    path.resolve(repoRoot, "packages", "eventbus-redis"),
    path.resolve(repoRoot, "packages", "host"),
    path.resolve(repoRoot, "packages", "node-example"),
    path.resolve(repoRoot, "packages", "runtime-dev"),
  ]);
});
