import test from "node:test";
import assert from "node:assert/strict";

import { WorkflowBuilder } from "../dist/index.js";

import {
  CallbackNodeConfig,
  IfNodeConfig,
  MapNodeConfig,
  MergeNodeConfig,
  SubWorkflowRunnerConfig,
  ThrowNodeConfig,
  chain,
  createEngineTestKit,
  dag,
  items,
} from "./harness/index.ts";

test("engine runs a simple A -> B -> C flow", async () => {
  const events: string[] = [];

  const A = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const B = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => events.push("C"), { id: "C" });

  const wf = chain({ id: "wf.abc", name: "A->B->C" }).start(A).then(B).then(C).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "completed");
  assert.equal(events.join(","), "A,B,C");
  assert.equal(r.outputs.length, 1);
  assert.deepEqual(r.outputs[0]?.json, { x: 1 });
});

test("engine runs a diamond DAG A -> B + C -> D (fan-in join, D executes once)", async () => {
  const events: string[] = [];
  let dInput: Array<any> = [];

  const g = dag({ id: "wf.diamond", name: "diamond" });
  const A = g.add(new CallbackNodeConfig("A", () => events.push("A"), { id: "A" }));
  const B = g.add(
    new MapNodeConfig(
      "B",
      async (item) => {
        events.push("B");
        return { b: (item.json as any).x + 1 };
      },
      { id: "B" },
    ),
  );
  const C = g.add(
    new MapNodeConfig(
      "C",
      async (item) => {
        events.push("C");
        return { c: (item.json as any).x + 2 };
      },
      { id: "C" },
    ),
  );
  const M = g.add(new MergeNodeConfig("Merge", { mode: "mergeByPosition", prefer: ["B", "C"] }, { id: "M" }));
  const D = g.add(
    new CallbackNodeConfig(
      "D",
      ({ items }) => {
        events.push("D");
        dInput = items as any;
      },
      { id: "D" },
    ),
  );

  g.connect(A, B, "main");
  g.connect(A, C, "main");
  g.connect(B, M, "main", "B");
  g.connect(C, M, "main", "C");
  g.connect(M, D, "main", "in");

  const wf = g.build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "completed");

  assert.equal(events.join(","), "A,B,C,D");
  assert.equal(dInput.length, 1);
  assert.deepEqual(dInput[0]?.json, { B: { b: 2 }, C: { c: 3 } });

  assert.equal(r.outputs.length, 1);
  assert.deepEqual(r.outputs[0]?.json, { B: { b: 2 }, C: { c: 3 } });
});

test("engine can run a subworkflow node", async () => {
  const events: string[] = [];
  const childParents: Array<any> = [];

  const childA = new CallbackNodeConfig(
    "childA",
    ({ ctx }) => {
      events.push("childA");
      childParents.push(ctx.parent);
    },
    { id: "childA" },
  );
  const childB = new CallbackNodeConfig(
    "childB",
    ({ ctx }) => {
      events.push("childB");
      childParents.push(ctx.parent);
    },
    { id: "childB" },
  );
  const child = chain({ id: "wf.child", name: "child" }).start(childA).then(childB).build();

  const parentA = new CallbackNodeConfig("parentA", () => events.push("parentA"), { id: "parentA" });
  const sub = new SubWorkflowRunnerConfig("sub", { workflowId: "wf.child", id: "sub" });
  const parentD = new CallbackNodeConfig("parentD", () => events.push("parentD"), { id: "parentD" });
  const parent = chain({ id: "wf.parent", name: "parent" }).start(parentA).then(sub).then(parentD).build();

  const kit = createEngineTestKit();
  await kit.start([parent, child]);

  const r = await kit.runToCompletion({ wf: parent, startAt: "parentA", items: items([{ x: 1 }]) });
  assert.equal(r.status, "completed");
  assert.equal(r.outputs.length, 1);
  assert.deepEqual(r.outputs[0]?.json, { x: 1 });

  // Child nodes should see a parent execution reference.
  assert.equal(childParents.length, 2);
  for (const p of childParents) {
    assert.ok(p);
    assert.equal(p.workflowId, "wf.parent");
    assert.equal(p.nodeId, "sub");
  }

  // Subworkflow runs inside the sub node execution.
  assert.equal(events.join(","), "parentA,childA,childB,parentD");
});

test("engine processes multiple items as a batch", async () => {
  const seen: Record<string, number> = {};
  const events: string[] = [];

  const A = new CallbackNodeConfig(
    "A",
    ({ items }) => {
      events.push("A");
      seen.A = items.length;
    },
    { id: "A" },
  );
  const B = new CallbackNodeConfig(
    "B",
    ({ items }) => {
      events.push("B");
      seen.B = items.length;
    },
    { id: "B" },
  );
  const C = new CallbackNodeConfig(
    "C",
    ({ items }) => {
      events.push("C");
      seen.C = items.length;
    },
    { id: "C" },
  );

  const wf = chain({ id: "wf.multi", name: "multi" }).start(A).then(B).then(C).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const input = items([{ n: 1 }, { n: 2 }, { n: 3 }]);
  const r = await kit.runToCompletion({ wf, startAt: "A", items: input });
  assert.equal(r.status, "completed");
  assert.equal(events.join(","), "A,B,C");

  assert.deepEqual(seen, { A: 3, B: 3, C: 3 });
  assert.equal(r.outputs.length, 3);
  assert.deepEqual(r.outputs.map((i) => i.json), [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

test("workflow completes when a node has 2 outputs but only emits 1 output key", async () => {
  const events: string[] = [];

  const g = dag({ id: "wf.if", name: "if" });
  g.add(new CallbackNodeConfig("A", () => events.push("A"), { id: "A" }));
  g.add(new IfNodeConfig("if", async () => true, { id: "if", omitUnusedOutputKey: true }));
  g.add(new ThrowNodeConfig("F", new Error("false branch should not execute"), { id: "F" }));
  g.add(new CallbackNodeConfig("T", () => events.push("T"), { id: "T" })); // keep T last for final outputs

  g.connect("A", "if", "main");
  g.connect("if", "T", "true");
  g.connect("if", "F", "false");

  const wf = g.build();
  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "completed");
  assert.equal(events.join(","), "A,T");
});

test("when({true,false}) auto-inserts merge and chain can continue", async () => {
  let afterItems: Array<any> = [];

  const wf = new WorkflowBuilder(
    { id: "wf.when.merge", name: "when+merge" },
    {
      makeMergeNode: (name) => new MergeNodeConfig(name, { mode: "passThrough", prefer: ["true", "false"] }, { id: "merge" }),
    },
  )
    .start(new MapNodeConfig("seed", async (item) => item.json, { id: "seed" }))
    .then(new IfNodeConfig("if", async (item) => Number((item.json as any).x ?? 0) % 2 === 0, { id: "if", omitUnusedOutputKey: false }))
    .when({
      true: [new MapNodeConfig("T", async (item) => ({ ...(item.json as any), branch: "true" }), { id: "T" })],
      false: [new MapNodeConfig("F", async (item) => ({ ...(item.json as any), branch: "false" }), { id: "F" })],
    })
    .then(
      new CallbackNodeConfig(
        "after",
        ({ items }) => {
          afterItems = items as any;
        },
        { id: "after" },
      ),
    )
    .build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "seed", items: items([{ x: 1 }, { x: 2 }]) });
  assert.equal(r.status, "completed");

  assert.equal(afterItems.length, 2);
  assert.deepEqual(afterItems.map((i) => i.json), [
    { x: 1, branch: "false" },
    { x: 2, branch: "true" },
  ]);
});

