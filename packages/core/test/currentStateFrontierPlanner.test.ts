import assert from "node:assert/strict";
import { test } from "vitest";

import { CurrentStateFrontierPlanner } from "../src/engine/planning/currentStateFrontierPlanner.ts";
import { WorkflowTopology } from "../src/engine/planning/WorkflowTopologyPlanner.ts";
import { CallbackNodeConfig, MergeNodeConfig, chain, dag, items } from "./harness/index.ts";

test("planner preserves pinned outputs when clearing from a pinned node", () => {
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new CallbackNodeConfig("B", () => {}, { id: "B" });
  const C = new CallbackNodeConfig("C", () => {}, { id: "C" });
  const workflow = chain({ id: "wf.planner.pinned", name: "Pinned planner" }).start(A).then(B).then(C).build();
  const planner = new CurrentStateFrontierPlanner(WorkflowTopology.fromWorkflow(workflow));

  const plan = planner.plan({
    currentState: {
      outputsByNode: {
        A: { main: items([{ value: "a" }]) },
        B: { main: items([{ value: "old-b" }]) },
        C: { main: items([{ value: "old-c" }]) },
      },
      nodeSnapshotsByNodeId: {},
      mutableState: {
        nodesById: {
          B: {
            pinnedOutputsByPort: { main: items([{ value: "pinned-b" }]) },
          },
        },
      },
    },
    stopCondition: { kind: "workflowCompleted" },
    reset: { clearFromNodeId: "B" },
  });

  assert.deepEqual(plan.clearedNodeIds, ["C"]);
  assert.deepEqual(plan.preservedPinnedNodeIds, ["B"]);
  assert.ok(plan.skippedNodeIds.includes("B"));
  assert.equal(plan.rootNodeId, undefined);
  assert.deepEqual(
    plan.queue.map((entry) => entry.nodeId),
    ["C"],
  );
  assert.deepEqual(
    plan.currentState.outputsByNode.B?.main?.map((item) => item.json),
    [{ value: "pinned-b" }],
  );
});

test("planner emits a collect queue entry when merge inputs are already satisfied", () => {
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new CallbackNodeConfig("B", () => {}, { id: "B" });
  const merge = new MergeNodeConfig("Merge", { mode: "append" }, { id: "merge" });
  const builder = dag({ id: "wf.planner.merge", name: "Merge planner" });
  builder.add(A);
  builder.add(B);
  builder.add(merge);
  builder.connect("A", "merge", "main", "left");
  builder.connect("B", "merge", "main", "right");
  const workflow = builder.build();
  const planner = new CurrentStateFrontierPlanner(WorkflowTopology.fromWorkflow(workflow));

  const plan = planner.plan({
    currentState: {
      outputsByNode: {
        A: { main: items([{ from: "A" }]) },
        B: { main: items([{ from: "B" }]) },
      },
      nodeSnapshotsByNodeId: {},
    },
    stopCondition: { kind: "workflowCompleted" },
  });

  assert.equal(plan.queue.length, 1);
  assert.equal(plan.queue[0]?.nodeId, "merge");
  assert.deepEqual(plan.queue[0]?.collect?.expectedInputs, ["left", "right"]);
  assert.deepEqual(
    plan.queue[0]?.collect?.received.left.map((item) => item.json),
    [{ from: "A" }],
  );
  assert.deepEqual(
    plan.queue[0]?.collect?.received.right.map((item) => item.json),
    [{ from: "B" }],
  );
});
