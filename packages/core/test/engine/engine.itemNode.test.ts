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

test("mapInput + schema: persisted inputsByPort shows mapped validated json", async () => {
  const kit = createEngineTestKit();
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new ItemHarnessNodeConfig("B", z.object({ y: z.number() }), async ({ input }) => ({ out: input.y }), {
    id: "B",
    mapInput: ({ item }) => ({ y: (item.json as { x: number }).x }),
  });
  const wf = chain({ id: "wf.item.map", name: "map input" }).start(A).then(B).build();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "completed");

  const stored = await kit.runStore.load(r.runId);
  assert.ok(stored);
  const snapB = stored.nodeSnapshotsByNodeId.B;
  assert.deepEqual(snapB?.inputsByPort?.in?.[0]?.json, { y: 1 });
  assert.deepEqual(snapB?.outputs?.main?.[0]?.json, { out: 1 });
});

test("schema failure without mapper fails before executeOne (NodeInputContractError)", async () => {
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

test("mapper output that fails schema fails before executeOne", async () => {
  const kit = createEngineTestKit();
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new ItemHarnessNodeConfig("B", z.object({ y: z.number() }), async ({ input }) => input, {
    id: "B",
    mapInput: () => ({ y: "nope" as unknown as number }),
  });
  const wf = chain({ id: "wf.item.mapfail", name: "map fail" }).start(A).then(B).build();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "failed");
});

test("batch CallbackNode still runs in legacy execute path", async () => {
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
        executeOne: async () => ({}),
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
