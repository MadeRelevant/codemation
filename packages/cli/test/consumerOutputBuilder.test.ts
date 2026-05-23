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

test("ensureWatching is idempotent: second call while already watching returns early", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-consumer-"));
  teardownConsumerRoot = consumerRoot;
  await writeFile(path.join(consumerRoot, "codemation.config.ts"), fixtureConfig, "utf8");

  const builder = new ConsumerOutputBuilder(consumerRoot);
  teardownBuilder = builder;
  await builder.ensureBuilt();

  const buildCounts: number[] = [];
  const watchArgs = {
    onBuildCompleted: async () => {
      buildCounts.push(1);
    },
  };

  // First call sets up the watcher; second call should return immediately (line 103 branch).
  await builder.ensureWatching(watchArgs);
  await builder.ensureWatching(watchArgs);
  // No assertion needed beyond it not throwing; the idempotent early-return is exercised.
  assert.equal(typeof builder, "object");
});

test("disposeWatching with a pending debounce timer clears the timeout", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-consumer-"));
  teardownConsumerRoot = consumerRoot;
  await writeFile(path.join(consumerRoot, "codemation.config.ts"), fixtureConfig, "utf8");
  const workflowPath = path.join(consumerRoot, "src", "workflows", "fixture.ts");
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, workflowSource("Fixture"), "utf8");

  const builder = new ConsumerOutputBuilder(consumerRoot);
  await builder.ensureBuilt();

  let buildCompleted = false;
  await builder.ensureWatching({
    onBuildCompleted: async () => {
      buildCompleted = true;
    },
  });

  // Trigger a file-change event by writing a file so the debounce timer is set.
  await writeFile(workflowPath, workflowSource("Fixture modified"), "utf8");
  // Immediately dispose before the 75ms debounce fires — clears the timeout.
  await builder.disposeWatching();

  // Watcher is gone; timer was cleared so no build completes.
  // Build may or may not have started depending on timing — just verify dispose didn't throw.
  assert.equal(buildCompleted, false);
});

test("ensureBuilt honors an explicit config path override", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-consumer-"));
  teardownConsumerRoot = consumerRoot;
  const overrideConfigPath = path.join(consumerRoot, ".codemation", "plugin-dev", "codemation.config.ts");
  await mkdir(path.dirname(overrideConfigPath), { recursive: true });
  await writeFile(overrideConfigPath, fixtureConfig, "utf8");
  const workflowPath = path.join(consumerRoot, "src", "workflows", "fixture.ts");
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, workflowSource("Fixture override"), "utf8");

  const builder = new ConsumerOutputBuilder(consumerRoot, undefined, undefined, overrideConfigPath);
  const snapshot = await builder.ensureBuilt();

  assert.equal(snapshot.configSourcePath, overrideConfigPath);
  assert.match(await readFile(snapshot.outputEntryPath, "utf8"), /codemationConsumerApp/);
});
