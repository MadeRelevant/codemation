import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { NodeActivationRequestInputPreparer } from "../../src/execution/NodeActivationRequestInputPreparer.ts";
import { NodeInputContractError } from "../../src/execution/NodeInputContractError.ts";
import type { WorkflowNodeInstanceFactory } from "../../src/index.ts";
import {
  CallbackNodeConfig,
  ItemHarnessNodeConfig,
  MergeNodeConfig,
  SwitchNodeConfig,
  chain,
  createEngineTestKit,
  dag,
  items,
} from "../harness/index.ts";

test("item nodes preserve output order for multi-item batches", async () => {
  const order: string[] = [];
  const A = new ItemHarnessNodeConfig(
    "A",
    z.object({ tag: z.string() }),
    async ({ input }) => {
      order.push(input.tag);
      return input;
    },
    { id: "A" },
  );
  const B = new ItemHarnessNodeConfig(
    "B",
    z.object({ tag: z.string() }),
    async ({ input }) => {
      order.push(`B:${input.tag}`);
      return input;
    },
    { id: "B" },
  );
  const C = new ItemHarnessNodeConfig(
    "C",
    z.object({ tag: z.string() }),
    async ({ input }) => {
      order.push(`C:${input.tag}`);
      return input;
    },
    { id: "C" },
  );

  const wf = chain({ id: "wf.item.order", name: "item order" }).start(A).then(B).then(C).build();
  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r = await kit.runToCompletion({
    wf,
    startAt: "A",
    items: items([{ tag: "a" }, { tag: "b" }, { tag: "c" }]),
  });
  assert.equal(r.status, "completed");
  assert.deepEqual(order, ["a", "b", "c", "B:a", "B:b", "B:c", "C:a", "C:b", "C:c"]);
  assert.deepEqual(
    r.outputs.map((i) => (i.json as { tag: string }).tag),
    ["a", "b", "c"],
  );
});

test("execute can use ctx.data to read non-immediate upstream node outputs", async () => {
  const kit = createEngineTestKit();
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new CallbackNodeConfig("B", () => {}, { id: "B" });
  const C = new ItemHarnessNodeConfig(
    "C",
    z.object({ step: z.number() }),
    async ({ input, ctx }) => {
      const aJson = ctx.data.getOutputItem("A", 0, "main")?.json as { step: number };
      return { merged: aJson.step + input.step };
    },
    { id: "C" },
  );
  const wf = chain({ id: "wf.item.cross", name: "cross-node ctx.data" }).start(A).then(B).then(C).build();
  await kit.start([wf]);

  const r = await kit.runToCompletion({
    wf,
    startAt: "A",
    items: items([{ step: 10 }, { step: 20 }]),
  });
  assert.equal(r.status, "completed");
  const stored = await kit.runStore.load(r.runId);
  assert.ok(stored);
  const snapC = stored.nodeSnapshotsByNodeId.C;
  assert.deepEqual(snapC?.inputsByPort?.in?.[0]?.json, { step: 10 });
  assert.deepEqual(snapC?.outputs?.main?.[0]?.json, { merged: 20 });
});

test("schema: wire json must satisfy inputSchema when mapper is not used", async () => {
  const kit = createEngineTestKit();
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new ItemHarnessNodeConfig("B", z.object({ x: z.number() }), async ({ input }) => ({ out: input.x }), {
    id: "B",
  });
  const wf = chain({ id: "wf.item.schema", name: "schema ok" }).start(A).then(B).build();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "completed");
  const stored = await kit.runStore.load(r.runId);
  assert.ok(stored);
  const snapB = stored.nodeSnapshotsByNodeId.B;
  assert.deepEqual(snapB?.inputsByPort?.in?.[0]?.json, { x: 1 });
  assert.deepEqual(snapB?.outputs?.main?.[0]?.json, { out: 1 });
});

test("schema failure without mapper fails before execute (NodeInputContractError)", async () => {
  const kit = createEngineTestKit();
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new ItemHarnessNodeConfig("B", z.object({ y: z.number() }), async ({ input }) => input, { id: "B" });
  const wf = chain({ id: "wf.item.schema", name: "schema fail" }).start(A).then(B).build();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "failed");
  const stored = await kit.runStore.load(r.runId);
  assert.ok(stored?.status === "failed");
  const failed = stored?.nodeSnapshotsByNodeId.B;
  assert.equal(failed?.status, "failed");
  assert.ok(
    String(failed?.error?.message ?? "").includes("contract") || String(failed?.error?.message ?? "").includes("y"),
  );
});

test("batch CallbackNode invokes handler once on last item in activation", async () => {
  const seen: string[] = [];
  const A = new CallbackNodeConfig(
    "A",
    ({ items }) => {
      seen.push(...items.map((i) => String((i.json as { k: string }).k)));
    },
    { id: "A" },
  );
  const wf = chain({ id: "wf.batch.legacy", name: "legacy batch" }).start(A).build();
  const kit = createEngineTestKit();
  await kit.start([wf]);
  const r = await kit.runToCompletion({
    wf,
    startAt: "A",
    items: items([{ k: "a" }, { k: "b" }]),
  });
  assert.equal(r.status, "completed");
  assert.deepEqual(seen, ["a", "b"]);
});

test("multi-input MergeNode executeMulti path unchanged", async () => {
  const g = dag({ id: "wf.merge.item", name: "merge" });
  const A = g.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  const B = g.add(
    new ItemHarnessNodeConfig("B", z.object({ x: z.number() }), async ({ input }) => ({ b: input.x + 1 }), { id: "B" }),
  );
  const C = g.add(
    new ItemHarnessNodeConfig("C", z.object({ x: z.number() }), async ({ input }) => ({ c: input.x + 2 }), { id: "C" }),
  );
  const M = g.add(new MergeNodeConfig("Merge", { mode: "mergeByPosition", prefer: ["B", "C"] }, { id: "M" }));
  const D = new CallbackNodeConfig("D", () => {}, { id: "D" });

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
  assert.deepEqual(r.outputs[0]?.json, { B: { b: 2 }, C: { c: 3 } });
});

test("NodeInputContractError includes nodeId and activationId", async () => {
  class ItemNodeStubFactory implements WorkflowNodeInstanceFactory {
    createNodes(): ReadonlyMap<string, unknown> {
      return new Map();
    }

    createByType(): unknown {
      return {
        kind: "node",
        outputPorts: ["main"],
        execute: async () => ({}),
      };
    }
  }

  class PreparerSchemaToken {}
  const preparer = new NodeActivationRequestInputPreparer(new ItemNodeStubFactory());

  try {
    await preparer.prepare({
      kind: "single",
      runId: "r1",
      activationId: "act_x",
      workflowId: "w1",
      nodeId: "n1",
      batchId: "batch_1",
      input: [{ json: { bad: true } }],
      ctx: {
        nodeId: "n1",
        activationId: "act_x",
        config: {
          kind: "node",
          type: PreparerSchemaToken,
          inputSchema: z.object({ y: z.number() }),
        },
        data: {},
      } as never,
    });
    assert.fail("expected NodeInputContractError");
  } catch (caught) {
    assert.ok(caught instanceof NodeInputContractError);
    assert.equal(caught.nodeId, "n1");
    assert.equal(caught.activationId, "act_x");
  }
});

test("execute array return fans out without Split", async () => {
  const kit = createEngineTestKit();
  const A = new ItemHarnessNodeConfig(
    "A",
    z.object({ n: z.number() }),
    async ({ input }) => {
      const out: { k: number }[] = [];
      for (let i = 0; i < 5; i++) out.push({ k: input.n * 10 + i });
      return out;
    },
    { id: "A" },
  );
  const B = new ItemHarnessNodeConfig(
    "B",
    z.object({ k: z.number() }),
    async ({ input }) => ({ doubled: input.k * 2 }),
    { id: "B" },
  );
  const wf = chain({ id: "wf.item.fanout", name: "fanout" }).start(A).then(B).build();
  await kit.start([wf]);
  const r = await kit.runToCompletion({
    wf,
    startAt: "A",
    items: items([{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]),
  });
  assert.equal(r.status, "completed");
  assert.equal(r.outputs.length, 25);
});

test("Switch routes items to multiple output ports", async () => {
  const g = dag({ id: "wf.switch.ports", name: "switch" });
  const A = g.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  const Sw = g.add(
    new SwitchNodeConfig(
      "Sw",
      {
        cases: ["even", "odd"],
        defaultCase: "default",
        resolveCaseKey: (item) => ((item.json as { v: number }).v % 2 === 0 ? "even" : "odd"),
      },
      { id: "Sw" },
    ),
  );
  const Even = g.add(new CallbackNodeConfig("Even", () => {}, { id: "Even" }));
  const Odd = g.add(new CallbackNodeConfig("Odd", () => {}, { id: "Odd" }));
  g.connect(A, Sw, "main");
  g.connect(Sw, Even, "even", "in");
  g.connect(Sw, Odd, "odd", "in");
  const wf = g.build();
  const kit = createEngineTestKit();
  await kit.start([wf]);
  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ v: 0 }, { v: 1 }, { v: 2 }]) });
  assert.equal(r.status, "completed");
  const stored = await kit.runStore.load(r.runId);
  assert.ok(stored);
  const swOut = stored.outputsByNode?.Sw;
  assert.ok(swOut);
  assert.equal(swOut.even?.length, 2);
  assert.equal(swOut.odd?.length, 1);
  const even = stored.outputsByNode?.Even?.main ?? [];
  const odd = stored.outputsByNode?.Odd?.main ?? [];
  assert.equal(even.length, 2);
  assert.equal(odd.length, 1);
});

test("diamond join appends items from multi-inbound edges", async () => {
  const g = dag({ id: "wf.diamond.join", name: "diamond" });
  const A = g.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  const B = g.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  const C = g.add(new CallbackNodeConfig("C", () => {}, { id: "C" }));
  const D = new ItemHarnessNodeConfig("D", z.object({ v: z.number() }), async ({ input }) => ({ v: input.v }), {
    id: "D",
  });
  g.add(D);
  g.connect(A, B, "main");
  g.connect(A, C, "main");
  g.connect(B, D, "main", "in");
  g.connect(C, D, "main", "in");
  const wf = g.build();
  const kit = createEngineTestKit();
  await kit.start([wf]);
  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ v: 3 }]) });
  assert.equal(r.status, "completed");
  assert.equal(r.outputs.length, 2);
  assert.deepEqual(
    r.outputs.map((i) => i.json),
    [{ v: 3 }, { v: 3 }],
  );
});
