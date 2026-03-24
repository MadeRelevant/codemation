import assert from "node:assert/strict";
import { test } from "vitest";

import { EngineExecutionLimitsPolicy } from "../src/engine/application/policies/EngineExecutionLimitsPolicy.ts";
import { EngineExecutionLimitsPolicyFactory } from "../src/engine/application/policies/EngineExecutionLimitsPolicyFactory.ts";

test("EngineExecutionLimitsPolicyFactory merges overrides from args", () => {
  const p = new EngineExecutionLimitsPolicyFactory().create({ hardMaxNodeActivations: 42, defaultMaxNodeActivations: 42 });
  const o = p.mergeExecutionOptionsForNewRun(undefined, undefined);
  assert.equal(o.maxNodeActivations, 42);
  assert.equal(o.maxSubworkflowDepth, 32);
});

test("root run gets defaults and caps", () => {
  const p = new EngineExecutionLimitsPolicy();
  const o = p.mergeExecutionOptionsForNewRun(undefined, { maxNodeActivations: 200_000, maxSubworkflowDepth: 100 });
  assert.equal(o.subworkflowDepth, 0);
  assert.equal(o.maxNodeActivations, 100_000);
  assert.equal(o.maxSubworkflowDepth, 32);
});

test("child depth and inheritance of limits from parent ref", () => {
  const p = new EngineExecutionLimitsPolicy();
  const root = p.mergeExecutionOptionsForNewRun(undefined, { maxSubworkflowDepth: 8 });
  const child = p.mergeExecutionOptionsForNewRun(
    {
      runId: "r1",
      workflowId: "w1",
      nodeId: "n1",
      subworkflowDepth: root.subworkflowDepth,
      engineMaxNodeActivations: root.maxNodeActivations,
      engineMaxSubworkflowDepth: root.maxSubworkflowDepth,
    },
    undefined,
  );
  assert.equal(child.subworkflowDepth, 1);
  assert.equal(child.maxSubworkflowDepth, 8);
  assert.equal(child.maxNodeActivations, 100_000);
});

test("child exceeding maxSubworkflowDepth throws", () => {
  const p = new EngineExecutionLimitsPolicy({ defaultMaxNodeActivations: 100, hardMaxNodeActivations: 100, defaultMaxSubworkflowDepth: 1, hardMaxSubworkflowDepth: 1 });
  const root = p.mergeExecutionOptionsForNewRun(undefined, undefined);
  const midParent = {
    runId: "r1",
    workflowId: "w1",
    nodeId: "n1",
    subworkflowDepth: root.subworkflowDepth,
    engineMaxNodeActivations: root.maxNodeActivations!,
    engineMaxSubworkflowDepth: root.maxSubworkflowDepth!,
  };
  const firstChild = p.mergeExecutionOptionsForNewRun(midParent, undefined);
  assert.equal(firstChild.subworkflowDepth, 1);
  const deepParent = {
    runId: "r2",
    workflowId: "w2",
    nodeId: "n2",
    subworkflowDepth: firstChild.subworkflowDepth,
    engineMaxNodeActivations: firstChild.maxNodeActivations!,
    engineMaxSubworkflowDepth: firstChild.maxSubworkflowDepth!,
  };
  assert.throws(() => p.mergeExecutionOptionsForNewRun(deepParent, undefined), /exceeds maxSubworkflowDepth/);
});
