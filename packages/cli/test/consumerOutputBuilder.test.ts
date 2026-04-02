import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, test } from "vitest";

import { ConsumerOutputBuilder, type ConsumerOutputBuildSnapshot } from "../src/consumer/ConsumerOutputBuilder";

// When the dev/watch pipeline and test environment have stabilized, refactor this suite so it does not
// rely on chokidar polling, debounce windows, and long wall-clock waits; the goal is faster, tighter tests.

const fixtureConfig = `export default {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;

function workflowSource(name: string): string {
  return `export default {
  id: "wf.cli.fixture",
  name: ${JSON.stringify(name)},
  nodes: [],
  edges: [],
};
`;
}

let teardownConsumerRoot: string | null = null;
let teardownBuilder: ConsumerOutputBuilder | null = null;

let previousChokidarPolling: string | undefined;

beforeEach(() => {
  previousChokidarPolling = process.env.CHOKIDAR_USEPOLLING;
  process.env.CHOKIDAR_USEPOLLING = "1";
});

afterEach(async () => {
  if (previousChokidarPolling === undefined) {
    delete process.env.CHOKIDAR_USEPOLLING;
  } else {
    process.env.CHOKIDAR_USEPOLLING = previousChokidarPolling;
  }
  if (teardownBuilder) {
    await teardownBuilder.disposeWatching();
    teardownBuilder = null;
  }
  if (teardownConsumerRoot) {
    await rm(teardownConsumerRoot, { force: true, recursive: true }).catch(() => null);
    teardownConsumerRoot = null;
  }
});

test("ensureBuilt writes build output, manifest path, and entry index", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-consumer-"));
  teardownConsumerRoot = consumerRoot;
  await writeFile(path.join(consumerRoot, "codemation.config.ts"), fixtureConfig, "utf8");
  const workflowPath = path.join(consumerRoot, "src", "workflows", "fixture.ts");
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, workflowSource("Fixture one"), "utf8");

  const builder = new ConsumerOutputBuilder(consumerRoot);
  const snapshot = await builder.ensureBuilt();

  assert.match(snapshot.buildVersion, /^\d+-\d+$/);
  assert.equal(snapshot.consumerRoot, consumerRoot);
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
  const indexText = await readFile(snapshot.outputEntryPath, "utf8");
  assert.match(indexText, /codemationConsumerBuildVersion/);
  assert.match(indexText, /workflowModule0/);
  const emittedWorkflow = path.join(snapshot.emitOutputRoot, "app", "src", "workflows", "fixture.js");
  assert.match(await readFile(emittedWorkflow, "utf8"), /wf\.cli\.fixture/);
  assert.ok(snapshot.manifestPath.endsWith("current.json"), "snapshot points at manifest path for CLI publish step");
});

test("ensureBuilt emits a config override from .codemation so the generated entry can import it", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-plugin-dev-"));
  teardownConsumerRoot = consumerRoot;
  const pluginEntryPath = path.join(consumerRoot, "codemation.plugin.ts");
  const syntheticConfigPath = path.join(consumerRoot, ".codemation", "plugin-dev", "codemation.config.ts");
  await mkdir(path.dirname(syntheticConfigPath), { recursive: true });
  await writeFile(
    pluginEntryPath,
    [
      "const plugin = {",
      "  sandbox: { workflows: [] },",
      "  register() {},",
      "};",
      "",
      "export default plugin;",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    syntheticConfigPath,
    [
      'import type { CodemationConfig } from "@codemation/host";',
      'import plugin from "../../codemation.plugin.ts";',
      "",
      "const sandbox = plugin.sandbox ?? {};",
      "const config: CodemationConfig = {",
      "  ...sandbox,",
      "  plugins: [...(sandbox.plugins ?? []), plugin],",
      "};",
      "",
      "export default config;",
      "",
    ].join("\n"),
    "utf8",
  );

  const builder = new ConsumerOutputBuilder(consumerRoot, undefined, undefined, syntheticConfigPath);
  const snapshot = await builder.ensureBuilt();

  const entryText = await readFile(snapshot.outputEntryPath, "utf8");
  assert.match(entryText, /\.\/app\/\.codemation\/plugin-dev\/codemation\.config\.js/);
  const emittedConfigPath = path.join(
    snapshot.emitOutputRoot,
    "app",
    ".codemation",
    "plugin-dev",
    "codemation.config.js",
  );
  const emittedConfigText = await readFile(emittedConfigPath, "utf8");
  assert.match(emittedConfigText, /\.\.\/\.\.\/codemation\.plugin\.js/);
});

test("watch rebuild updates workflow output after a single file change (incremental path)", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-consumer-"));
  teardownConsumerRoot = consumerRoot;
  await writeFile(path.join(consumerRoot, "codemation.config.ts"), fixtureConfig, "utf8");
  const workflowPath = path.join(consumerRoot, "src", "workflows", "fixture.ts");
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, workflowSource("Fixture one"), "utf8");

  const builder = new ConsumerOutputBuilder(consumerRoot);
  teardownBuilder = builder;
  const first = await builder.ensureBuilt();
  const emittedWorkflowJs = path.join(first.emitOutputRoot, "app", "src", "workflows", "fixture.js");
  assert.match(await readFile(emittedWorkflowJs, "utf8"), /Fixture one/);

  const watchBuilds: Array<{ buildVersion: string }> = [];
  let watchSnapshot: ConsumerOutputBuildSnapshot | undefined;
  await builder.ensureWatching({
    onBuildFailed: async (error) => {
      assert.fail(`watch consumer build failed: ${error.message}`);
    },
    onBuildCompleted: async (snap) => {
      watchBuilds.push({ buildVersion: snap.buildVersion });
      watchSnapshot = snap;
    },
  });
  await delay(500);

  await writeFile(workflowPath, workflowSource("Fixture two"), "utf8");

  for (let attempt = 0; attempt < 1200 && watchBuilds.length < 1; attempt += 1) {
    await delay(50);
  }
  assert.equal(watchBuilds.length, 1, "expected one watch-triggered build");
  assert.notEqual(watchBuilds[0].buildVersion, first.buildVersion);
  assert.ok(watchSnapshot);
  const emittedAfter = path.join(watchSnapshot.emitOutputRoot, "app", "src", "workflows", "fixture.js");
  assert.match(await readFile(emittedAfter, "utf8"), /Fixture two/);
});
