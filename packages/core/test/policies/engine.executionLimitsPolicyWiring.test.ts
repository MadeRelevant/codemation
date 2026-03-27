import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import { EngineExecutionLimitsPolicy } from "../../src/engine/application/policies/EngineExecutionLimitsPolicy.ts";
import { createEngineTestKit } from "../harness/engine.ts";
import { CallbackNodeConfig, dag, items, SubWorkflowRunnerConfig } from "../harness/index.ts";

function linearWorkflow(nodeCount: number) {
  const b = dag({ id: "wf.policy.wiring.linear", name: "Linear" });
  const ids: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const id = `n${i}`;
    b.add(new CallbackNodeConfig(id, () => {}, { id }));
    ids.push(id);
  }
  for (let i = 0; i < nodeCount - 1; i++) {
    b.connect(ids[i]!, ids[i + 1]!);
  }
  return b.build();
}

test("EngineFactory executionLimitsPolicy caps activations without per-run options", async () => {
  const policy = new EngineExecutionLimitsPolicy({
    defaultMaxNodeActivations: 3,
    hardMaxNodeActivations: 3,
    defaultMaxSubworkflowDepth: 32,
    hardMaxSubworkflowDepth: 32,
  });
  const wf = linearWorkflow(10);
  const kit = await createEngineTestKit({ executionLimitsPolicy: policy });
  await kit.start([wf]);
  const result = await kit.engine.runWorkflow(wf, "n0", items([{ v: 1 }]), undefined, undefined);
  if (result.status !== "pending") {
    assert.fail("expected pending then failure");
  }
  const done = await kit.engine.waitForCompletion(result.runId);
  assert.equal(done.status, "failed");
  assert.match(done.error.message, /maxNodeActivations/);
}, 2000);

test("EngineFactory executionLimitsPolicy caps subworkflow depth without per-run options", async () => {
  const policy = new EngineExecutionLimitsPolicy({
    defaultMaxNodeActivations: 100,
    hardMaxNodeActivations: 100,
    defaultMaxSubworkflowDepth: 0,
    hardMaxSubworkflowDepth: 0,
  });
  const child = dag({ id: "wf.policy.wiring.child", name: "Child" });
  child.add(new CallbackNodeConfig("leaf", () => {}, { id: "n0" }));
  const wfChild = child.build();

  const parent = dag({ id: "wf.policy.wiring.parent", name: "Parent" });
  const start = parent.add(new CallbackNodeConfig("start", () => {}, { id: "start" }));
  parent.add(new SubWorkflowRunnerConfig("sub", { workflowId: "wf.policy.wiring.child", id: "sub" }));
  parent.connect(start, "sub");
  const wfParent = parent.build();

  const kit = await createEngineTestKit({ executionLimitsPolicy: policy });
  await kit.start([wfParent, wfChild]);

  const scheduled = await kit.engine.runWorkflow(wfParent, "start", items([{ v: 1 }]), undefined, undefined);
  assert.equal(scheduled.status, "pending");
  const done = await kit.engine.waitForCompletion(scheduled.runId);
  assert.equal(done.status, "failed");
  assert.match(done.error.message, /maxSubworkflowDepth/);
}, 2000);
