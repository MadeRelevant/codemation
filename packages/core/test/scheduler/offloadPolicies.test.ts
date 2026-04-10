import assert from "node:assert/strict";
import { test } from "vitest";

import { ConfigDrivenOffloadPolicy } from "../../src/scheduler/ConfigDrivenOffloadPolicy";
import { HintOnlyOffloadPolicy } from "../../src/scheduler/HintOnlyOffloadPolicy";
import { LocalOnlyScheduler } from "../../src/scheduler/LocalOnlyScheduler";

test("ConfigDrivenOffloadPolicy: respects explicit execution hint", () => {
  const p = new ConfigDrivenOffloadPolicy("worker");

  assert.deepEqual(
    p.decide({
      workflowId: "wf",
      nodeId: "n1",
      config: { kind: "node", type: class {}, execution: { hint: "local" } },
    }),
    { mode: "local" },
  );

  assert.deepEqual(
    p.decide({
      workflowId: "wf",
      nodeId: "n1",
      config: { kind: "node", type: class {}, execution: { hint: "worker", queue: "q1" } },
    }),
    { mode: "worker", queue: "q1" },
  );
});

test("ConfigDrivenOffloadPolicy: queue implies worker when hint absent", () => {
  const p = new ConfigDrivenOffloadPolicy("local");
  assert.deepEqual(
    p.decide({ workflowId: "wf", nodeId: "n1", config: { kind: "node", type: class {}, execution: { queue: "q1" } } }),
    { mode: "worker", queue: "q1" },
  );
});

test("ConfigDrivenOffloadPolicy: falls back to default mode", () => {
  const workerDefault = new ConfigDrivenOffloadPolicy("worker");
  assert.deepEqual(workerDefault.decide({ workflowId: "wf", nodeId: "n1", config: { kind: "node", type: class {} } }), {
    mode: "worker",
  });

  const localDefault = new ConfigDrivenOffloadPolicy("local");
  assert.deepEqual(localDefault.decide({ workflowId: "wf", nodeId: "n1", config: { kind: "node", type: class {} } }), {
    mode: "local",
  });
});

test("HintOnlyOffloadPolicy: worker only when explicitly hinted", () => {
  const p = new HintOnlyOffloadPolicy();
  assert.deepEqual(p.decide({ workflowId: "wf", nodeId: "n1", config: { kind: "node", type: class {} } }), {
    mode: "local",
  });
  assert.deepEqual(
    p.decide({
      workflowId: "wf",
      nodeId: "n1",
      config: { kind: "node", type: class {}, execution: { hint: "worker", queue: "q1" } },
    }),
    { mode: "worker", queue: "q1" },
  );
});

test("LocalOnlyScheduler: enqueue throws when no worker scheduler configured", async () => {
  const s = new LocalOnlyScheduler();
  await assert.rejects(
    () => s.enqueue({ runId: "r1", activationId: "a1", workflowId: "w1", nodeId: "n1", input: [] }),
    /no worker scheduler configured/i,
  );
});
