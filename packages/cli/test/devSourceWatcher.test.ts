import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";

import { DevSourceWatcher } from "../src/dev/DevSourceWatcher";

let teardownRoot: string | null = null;

afterEach(async () => {
  if (teardownRoot) {
    await rm(teardownRoot, { force: true, recursive: true }).catch(() => null);
    teardownRoot = null;
  }
});

test("DevSourceWatcher emits changes from an explicitly watched dist root", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-dev-source-watcher-"));
  teardownRoot = workspaceRoot;
  const distRoot = path.join(workspaceRoot, "packages", "plugin-a", "dist");
  const watchedFile = path.join(distRoot, "codemation.plugin.js");
  await mkdir(distRoot, { recursive: true });
  await writeFile(watchedFile, "export default {};\n", "utf8");

  const watcher = new DevSourceWatcher();
  let resolveChangedPaths: ((value: ReadonlyArray<string>) => void) | null = null;
  let rejectChangedPaths: ((reason?: unknown) => void) | null = null;
  const changedPathsPromise = new Promise<ReadonlyArray<string>>((resolve, reject) => {
    resolveChangedPaths = resolve;
    rejectChangedPaths = reject;
  });
  const timeout = setTimeout(() => {
    rejectChangedPaths?.(new Error("Timed out waiting for watched dist output to trigger a change event."));
  }, 5000);

  await watcher.start({
    roots: [distRoot],
    onChange: async ({ changedPaths }) => {
      clearTimeout(timeout);
      resolveChangedPaths?.(changedPaths);
    },
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await writeFile(watchedFile, "export default { updated: true };\n", "utf8");
    const changedPaths = await changedPathsPromise;
    assert.deepEqual(changedPaths, [path.resolve(watchedFile)]);
  } finally {
    clearTimeout(timeout);
    await watcher.stop();
  }
});
