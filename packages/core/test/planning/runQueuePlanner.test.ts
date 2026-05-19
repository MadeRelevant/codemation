import assert from "node:assert/strict";
import { test } from "vitest";

import { RunQueuePlanner } from "../../src/planning/RunQueuePlanner.ts";
import { WorkflowTopology } from "../../src/planning/WorkflowTopologyPlanner.ts";
import type { RunQueueEntry } from "../../src/types/index.ts";
import { CallbackNode, CallbackNodeConfig, MergeNode, MergeNodeConfig, chain, dag, items } from "../harness/index.ts";

test("planner seals a partially satisfied collect with empty inputs when no runnable work remains", () => {
  const builder = dag({ id: "wf.run-queue.partial-collect", name: "Partial collect" });
  builder.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  builder.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  builder.add(new MergeNodeConfig("Merge", { mode: "append" }, { id: "merge" }));
  builder.connect("A", "merge", "main", "left");
  builder.connect("B", "merge", "main", "right");
  const workflow = builder.build();
  const planner = new RunQueuePlanner(WorkflowTopology.fromWorkflow(workflow), new Map([["merge", new MergeNode()]]));
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
  const planner = new RunQueuePlanner(WorkflowTopology.fromWorkflow(workflow), new Map([["merge", new MergeNode()]]));
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

test("planner enqueues a single-input node when the source opts into continueWhenEmptyOutput", () => {
  const A = new CallbackNodeConfig("A", () => {}, { id: "A", continueWhenEmptyOutput: true });
  const B = new CallbackNodeConfig("B", () => {}, { id: "B" });
  const workflow = chain({ id: "wf.run-queue.empty-continue", name: "Empty continue" }).start(A).then(B).build();
  const planner = new RunQueuePlanner(
    WorkflowTopology.fromWorkflow(workflow),
    new Map([
      ["A", new CallbackNode()],
      ["B", new CallbackNode()],
    ]),
  );
  const queue: RunQueueEntry[] = [];
  planner.applyOutputs(queue, { fromNodeId: "A", outputs: { main: [] }, batchId: "batch_1" });

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.nodeId, "B");
  assert.deepEqual(queue[0]?.input, []);
});

test("planner routes Merge inbound edges through collect using topology even when node instance map is empty", () => {
  const builder = dag({ id: "wf.run-queue.merge-topology", name: "Merge topology" });
  builder.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  builder.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  builder.add(new MergeNodeConfig("Merge", { mode: "append" }, { id: "merge" }));
  builder.connect("A", "merge", "main", "left");
  builder.connect("B", "merge", "main", "right");
  const workflow = builder.build();
  const planner = new RunQueuePlanner(WorkflowTopology.fromWorkflow(workflow), new Map());
  const queue: RunQueueEntry[] = [];
  planner.applyOutputs(queue, {
    fromNodeId: "A",
    outputs: { main: items([{ branch: "left" }]) },
    batchId: "batch_1",
  });

  assert.equal(queue.length, 1);
  const entry = queue[0]!;
  assert.ok(entry.collect);
  assert.equal(entry.nodeId, "merge");
  assert.deepEqual(entry.collect?.received?.left, items([{ branch: "left" }]));
});

test("planner propagates empty output past single-input nodes when the source does not opt in", () => {
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new CallbackNodeConfig("B", () => {}, { id: "B" });
  const workflow = chain({ id: "wf.run-queue.empty-skip", name: "Empty skip" }).start(A).then(B).build();
  const planner = new RunQueuePlanner(
    WorkflowTopology.fromWorkflow(workflow),
    new Map([
      ["A", new CallbackNode()],
      ["B", new CallbackNode()],
    ]),
  );
  const queue: RunQueueEntry[] = [];
  planner.applyOutputs(queue, { fromNodeId: "A", outputs: { main: [] }, batchId: "batch_1" });

  assert.equal(queue.length, 0);
});

test("planner does not let a skipped node's continueWhenEmptyOutput resurrect downstream execution", () => {
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new CallbackNodeConfig("B", () => {}, { id: "B", continueWhenEmptyOutput: true });
  const C = new CallbackNodeConfig("C", () => {}, { id: "C" });
  const workflow = chain({ id: "wf.run-queue.empty-skip-resurrection", name: "Empty skip resurrection" })
    .start(A)
    .then(B)
    .then(C)
    .build();
  const planner = new RunQueuePlanner(
    WorkflowTopology.fromWorkflow(workflow),
    new Map([
      ["A", new CallbackNode()],
      ["B", new CallbackNode()],
      ["C", new CallbackNode()],
    ]),
  );
  const queue: RunQueueEntry[] = [];

  planner.applyOutputs(queue, { fromNodeId: "A", outputs: { main: [] }, batchId: "batch_1" });

  assert.equal(queue.length, 0);
});

test("validateNodeKinds throws when a node has multiple inbound edges and is not registered in nodeInstances", () => {
  const builder = dag({ id: "wf.validate.multi-not-supported", name: "Multi not supported" });
  builder.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  builder.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  builder.add(new CallbackNodeConfig("C", () => {}, { id: "C" }));
  // C receives from both A and B on different input ports
  builder.connect("A", "C", "main", "left");
  builder.connect("B", "C", "main", "right");
  const workflow = builder.build();
  // Node C is not registered in the instances map → inst is undefined → no multi-input support
  const planner = new RunQueuePlanner(WorkflowTopology.fromWorkflow(workflow), new Map());
  assert.throws(() => planner.validateNodeKinds(), /does not support multi-input/);
});

test("describeUnsatisfiedCollect renders received and missing inputs in the error", () => {
  const builder = dag({ id: "wf.validate.stuck-collect-desc", name: "Stuck describe" });
  builder.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  builder.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  builder.add(new MergeNodeConfig("Merge", { mode: "append" }, { id: "merge" }));
  builder.connect("A", "merge", "main", "left");
  builder.connect("B", "merge", "main", "right");
  const workflow = builder.build();
  const planner = new RunQueuePlanner(WorkflowTopology.fromWorkflow(workflow), new Map([["merge", new MergeNode()]]));
  // A collect with NO received inputs is "stuck" — resolveSealedCollect skips it (Object.keys(received).length === 0)
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
  // nextActivation should throw because the collect is stuck (no received inputs, nothing can proceed)
  assert.throws(() => planner.nextActivation(queue), /Multi-input collect is stuck/);
});
