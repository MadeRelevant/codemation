import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import { createEngineTestKit } from "./harness/engine.ts";
import { CallbackNodeConfig, dag, items, SubWorkflowRunnerConfig } from "./harness/index.ts";

test("first subworkflow child rejects when maxSubworkflowDepth is 0", async () => {
  const child = dag({ id: "wf.depth.child", name: "Child" });
  child.add(new CallbackNodeConfig("leaf", () => {}, { id: "n0" }));
  const wfChild = child.build();

  const parent = dag({ id: "wf.depth.parent", name: "Parent" });
  const start = parent.add(new CallbackNodeConfig("start", () => {}, { id: "start" }));
  parent.add(new SubWorkflowRunnerConfig("sub", { workflowId: "wf.depth.child", id: "sub" }));
  parent.connect(start, "sub");
  const wfParent = parent.build();

  const kit = await createEngineTestKit();
  await kit.start([wfParent, wfChild]);

  const scheduled = await kit.engine.runWorkflow(wfParent, "start", items([{ v: 1 }]), undefined, {
    maxSubworkflowDepth: 0,
  });
  assert.equal(scheduled.status, "pending");
  const done = await kit.engine.waitForCompletion(scheduled.runId);
  assert.equal(done.status, "failed");
  assert.match(done.error.message, /maxSubworkflowDepth/);
}, 2000);
