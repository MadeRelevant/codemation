import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";

import { ConsumerBuildArtifactsPublisher } from "../src/build/ConsumerBuildArtifactsPublisher";
import type { ConsumerOutputBuildSnapshot } from "../src/consumer/ConsumerOutputBuilder";

let teardownRoot: string | null = null;

afterEach(async () => {
  if (teardownRoot) {
    await rm(teardownRoot, { force: true, recursive: true }).catch(() => null);
    teardownRoot = null;
  }
});

test("publish writes the current manifest and an empty discovered plugins module", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-publish-"));
  teardownRoot = consumerRoot;
  const outputRoot = path.join(consumerRoot, ".codemation", "output");
  const emitOutputRoot = path.join(outputRoot, "build");
  await mkdir(emitOutputRoot, { recursive: true });

  const snapshot: ConsumerOutputBuildSnapshot = {
    buildVersion: "1-123",
    configSourcePath: null,
    consumerRoot,
    manifestPath: path.join(outputRoot, "current.json"),
    outputEntryPath: path.join(emitOutputRoot, "index.js"),
    outputRoot,
    emitOutputRoot,
    workflowSourcePaths: [],
    workflowDiscoveryPathSegmentsList: [],
  };

  const manifest = await new ConsumerBuildArtifactsPublisher().publish(snapshot, []);
  const manifestJson = JSON.parse(await readFile(manifest.manifestPath, "utf8")) as {
    pluginEntryPath?: string;
    entryPath?: string;
  };

  assert.equal(manifest.entryPath, snapshot.outputEntryPath);
  assert.equal(manifest.pluginEntryPath, path.join(emitOutputRoot, "plugins.js"));
  assert.equal(manifestJson.pluginEntryPath, manifest.pluginEntryPath);
  assert.equal(manifestJson.entryPath, manifest.entryPath);
  assert.match(await readFile(manifest.pluginEntryPath, "utf8"), /codemationDiscoveredPlugins/);
});

test("publish imports the packaged plugin entry even when a source plugin entry exists", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-publish-plugin-entry-"));
  teardownRoot = consumerRoot;
  const outputRoot = path.join(consumerRoot, ".codemation", "output");
  const emitOutputRoot = path.join(outputRoot, "build");
  const packageRoot = path.join(consumerRoot, "node_modules", "@codemation", "example-plugin");
  await mkdir(emitOutputRoot, { recursive: true });
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });

  const snapshot: ConsumerOutputBuildSnapshot = {
    buildVersion: "2-456",
    configSourcePath: null,
    consumerRoot,
    manifestPath: path.join(outputRoot, "current.json"),
    outputEntryPath: path.join(emitOutputRoot, "index.js"),
    outputRoot,
    emitOutputRoot,
    workflowSourcePaths: [],
    workflowDiscoveryPathSegmentsList: [],
  };

  const manifest = await new ConsumerBuildArtifactsPublisher().publish(snapshot, [
    {
      packageName: "@codemation/example-plugin",
      packageRoot,
      pluginEntry: "./dist/codemation.plugin.js",
      developmentEntry: "codemation.plugin.ts",
    },
  ]);
  const pluginsSource = await readFile(manifest.pluginEntryPath, "utf8");

  assert.match(pluginsSource, /dist\/codemation\.plugin\.js/);
  assert.doesNotMatch(pluginsSource, /codemation\.plugin\.ts/);
});
