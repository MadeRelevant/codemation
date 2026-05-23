import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { setTimeout as delay } from "node:timers/promises";

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

  const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0, debounceMs: 50 });
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

test("DevSourceWatcher ignores changes inside node_modules directories (isIgnoredPath branch)", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-dev-source-watcher-"));
  teardownRoot = workspaceRoot;
  // Watch the workspace root; change a file inside node_modules (should be ignored)
  const nodeModulesDir = path.join(workspaceRoot, "node_modules", "some-pkg");
  const nodeModulesFile = path.join(nodeModulesDir, "index.js");
  await mkdir(nodeModulesDir, { recursive: true });
  await writeFile(nodeModulesFile, "module.exports = {};\n", "utf8");

  // Also create a normal .ts file to watch
  const srcFile = path.join(workspaceRoot, "index.ts");
  await writeFile(srcFile, "export const x = 1;\n", "utf8");

  const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0, debounceMs: 50 });
  const changedPaths: string[] = [];

  await watcher.start({
    roots: [workspaceRoot],
    onChange: async ({ changedPaths: paths }) => {
      changedPaths.push(...paths);
    },
  });

  try {
    await delay(200);
    // Write to node_modules file — should be filtered out by isIgnoredPath
    await writeFile(nodeModulesFile, "module.exports = { updated: true };\n", "utf8");
    await delay(300);

    // Write to the real source file — should fire onChange
    await writeFile(srcFile, "export const x = 2;\n", "utf8");

    // Wait for the onChange to fire (from the source file, not the node_modules file)
    for (let i = 0; i < 100 && changedPaths.length === 0; i++) {
      await delay(50);
    }

    assert.ok(changedPaths.length > 0, "Expected at least one changed path from the source file");
    assert.ok(!changedPaths.some((p) => p.includes("node_modules")), "node_modules paths must be filtered out");
  } finally {
    await watcher.stop();
  }
});

test("DevSourceWatcher ignores non-relevant files (isRelevantPath branch: txt file)", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-dev-source-watcher-"));
  teardownRoot = workspaceRoot;
  const txtFile = path.join(workspaceRoot, "README.txt");
  const tsFile = path.join(workspaceRoot, "main.ts");
  await writeFile(txtFile, "hello\n", "utf8");
  await writeFile(tsFile, "export const a = 1;\n", "utf8");

  const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0, debounceMs: 50 });
  const changedPaths: string[] = [];

  await watcher.start({
    roots: [workspaceRoot],
    onChange: async ({ changedPaths: paths }) => {
      changedPaths.push(...paths);
    },
  });

  try {
    await delay(200);
    // Write to txt file — should be filtered by isRelevantPath
    await writeFile(txtFile, "updated\n", "utf8");
    await delay(300);

    // Write to .ts file — should trigger onChange
    await writeFile(tsFile, "export const a = 2;\n", "utf8");
    for (let i = 0; i < 100 && changedPaths.length === 0; i++) {
      await delay(50);
    }

    assert.ok(
      changedPaths.some((p) => p.includes("main.ts")),
      "Expected main.ts to be in changed paths",
    );
    assert.ok(!changedPaths.some((p) => p.includes("README.txt")), "txt files must be filtered out");
  } finally {
    await watcher.stop();
  }
});
