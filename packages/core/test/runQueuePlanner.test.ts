import assert from "node:assert/strict";
import { test } from "vitest";

import { RunQueuePlanner } from "../src/engine/planning/runQueuePlanner.ts";
import { WorkflowTopology } from "../src/engine/planning/WorkflowTopologyPlanner.ts";
import type { RunQueueEntry } from "../src/types.ts";
import { CallbackNodeConfig,MergeNode,MergeNodeConfig,dag,items } from "./harness/index.ts";

test("planner seals a partially satisfied collect with empty inputs when no runnable work remains", () => {
  const builder = dag({ id: "wf.run-queue.partial-collect", name: "Partial collect" });
  builder.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  builder.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  builder.add(new MergeNodeConfig("Merge", { mode: "append" }, { id: "merge" }));
  builder.connect("A", "merge", "main", "left");
  builder.connect("B", "merge", "main", "right");
  const workflow = builder.build();
  const planner = new RunQueuePlanner(
    WorkflowTopology.fromWorkflow(workflow),
    new Map([
      ["merge", new MergeNode()],
    ]),
  );
  const queue: RunQueueEntry[] = [
    {
      nodeId: "merge",
      input: [],
      batchId: "batch_1",
      collect: {
        expectedInputs: ["left", "right"],
        received: {
          left: items([{ branch: "left" }]),
        },
      },
    },
  ];

  const next = planner.nextActivation(queue);

  assert.deepEqual(next, {
    kind: "multi",
    nodeId: "merge",
    batchId: "batch_1",
    inputsByPort: {
      left: items([{ branch: "left" }]),
      right: [],
    },
  });
  assert.equal(queue.length, 0);
});

test("planner still reports a collect with no received inputs as stuck", () => {
  const builder = dag({ id: "wf.run-queue.stuck-collect", name: "Stuck collect" });
  builder.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  builder.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  builder.add(new MergeNodeConfig("Merge", { mode: "append" }, { id: "merge" }));
  builder.connect("A", "merge", "main", "left");
  builder.connect("B", "merge", "main", "right");
  const workflow = builder.build();
  const planner = new RunQueuePlanner(
    WorkflowTopology.fromWorkflow(workflow),
    new Map([
      ["merge", new MergeNode()],
    ]),
  );
  const queue: RunQueueEntry[] = [
    {
      nodeId: "merge",
      input: [],
      batchId: "batch_1",
      collect: {
        expectedInputs: ["left", "right"],
        received: {},
      },
    },
  ];

  assert.throws(() => planner.nextActivation(queue), /Multi-input collect is stuck/);
});
