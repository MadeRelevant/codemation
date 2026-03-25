import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "vitest";

import { ConsumerOutputBuilder } from "../src/consumer/ConsumerOutputBuilder";

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

beforeEach(() => {
  process.env.CHOKIDAR_USEPOLLING = "1";
});

afterEach(async () => {
  if (teardownConsumerRoot) {
    await rm(teardownConsumerRoot, { force: true, recursive: true }).catch(() => null);
    teardownConsumerRoot = null;
  }
});

test("default build emits a .map next to transpiled workflow output", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-consumer-"));
  teardownConsumerRoot = consumerRoot;
  await writeFile(path.join(consumerRoot, "codemation.config.ts"), fixtureConfig, "utf8");
  const workflowPath = path.join(consumerRoot, "src", "workflows", "fixture.ts");
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, workflowSource("Fixture one"), "utf8");

  const builder = new ConsumerOutputBuilder(consumerRoot);
  const snapshot = await builder.ensureBuilt();
  const emittedWorkflow = path.join(snapshot.emitOutputRoot, "app", "src", "workflows", "fixture.js");
  await access(`${emittedWorkflow}.map`);
});

test("build with sourceMaps false does not emit .map for workflow output", async () => {
  const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-consumer-"));
  teardownConsumerRoot = consumerRoot;
  await writeFile(path.join(consumerRoot, "codemation.config.ts"), fixtureConfig, "utf8");
  const workflowPath = path.join(consumerRoot, "src", "workflows", "fixture.ts");
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, workflowSource("Fixture one"), "utf8");

  const builder = new ConsumerOutputBuilder(consumerRoot, undefined, {
    sourceMaps: false,
    target: "es2022",
  });
  const snapshot = await builder.ensureBuilt();
  const emittedWorkflow = path.join(snapshot.emitOutputRoot, "app", "src", "workflows", "fixture.js");
  assert.match(await readFile(emittedWorkflow, "utf8"), /wf\.cli\.fixture/);
  await assert.rejects(() => access(`${emittedWorkflow}.map`));
});
