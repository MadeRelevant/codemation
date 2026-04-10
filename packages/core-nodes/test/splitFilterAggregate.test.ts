import type { Item, NodeExecutionContext } from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";
import { Aggregate, AggregateNode, Filter, FilterNode, Split, SplitNode } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { test } from "vitest";

import { runPerItemLikeEngine } from "./engineTestHelpers.ts";

class CoreNodesTestContextFactory {
  static create<TConfig extends { name: string }>(config: TConfig): NodeExecutionContext<TConfig> {
    const binary = new DefaultExecutionBinaryService(
      new InMemoryBinaryStorage(),
      "wf_test",
      "run_test",
      () => new Date(),
    );
    return {
      runId: "run_test",
      workflowId: "wf_test",
      parent: undefined,
      now: () => new Date(),
      data: new InMemoryRunDataFactory().create(),
      nodeId: "node_test",
      activationId: "act_test",
      config,
      binary: binary.forNode({ nodeId: "node_test", activationId: "act_test" }),
    };
  }
}

test("SplitNode expands each item into one output item per returned element", async () => {
  const config = new Split<{ batch: readonly number[] }, number>("Split batches", (item) => [...item.json.batch]);
  const batchItems: Item[] = [{ json: { batch: [1, 2] } }, { json: { batch: [3] } }];
  const out = await runPerItemLikeEngine(new SplitNode(), batchItems, CoreNodesTestContextFactory.create(config));
  assert.deepEqual(
    out.main?.map((i) => i.json),
    [1, 2, 3],
  );
});

test("SplitNode yields an empty main batch when every split is empty", async () => {
  const config = new Split<unknown, never>("Empty splits", () => []);
  const out = await runPerItemLikeEngine(new SplitNode(), [{ json: {} }], CoreNodesTestContextFactory.create(config));
  assert.deepEqual(out.main ?? [], []);
});

test("FilterNode keeps only items matching the predicate", async () => {
  const config = new Filter<{ n: number }>("Evens", (item) => item.json.n % 2 === 0);
  const batchItems: Item[] = [{ json: { n: 1 } }, { json: { n: 2 } }, { json: { n: 4 } }];
  const out = await runPerItemLikeEngine(new FilterNode(), batchItems, CoreNodesTestContextFactory.create(config));
  assert.deepEqual(
    out.main?.map((i) => (i.json as { n: number }).n),
    [2, 4],
  );
});

test("FilterNode returns an empty batch when nothing matches", async () => {
  const config = new Filter<number>("None", () => false);
  const out = await runPerItemLikeEngine(
    new FilterNode(),
    [{ json: 1 }, { json: 2 }],
    CoreNodesTestContextFactory.create(config),
  );
  assert.deepEqual(out.main ?? [], []);
});

test("AggregateNode reduces the batch to a single item on main", async () => {
  const config = new Aggregate<{ v: number }, { sum: number }>("Sum values", (items) => ({
    sum: items.reduce((acc, i) => acc + i.json.v, 0),
  }));
  const batchItems: Item[] = [{ json: { v: 1 } }, { json: { v: 2 } }, { json: { v: 3 } }];
  const out = await runPerItemLikeEngine(new AggregateNode(), batchItems, CoreNodesTestContextFactory.create(config));
  assert.equal(out.main?.length, 1);
  assert.deepEqual(out.main?.[0]?.json, { sum: 6 });
});

test("AggregateNode returns an empty main batch when the input batch is empty", async () => {
  const config = new Aggregate<number, number>("Nop", () => 0);
  const out = await runPerItemLikeEngine(new AggregateNode(), [], CoreNodesTestContextFactory.create(config));
  assert.deepEqual(out.main ?? [], []);
});

test("AggregateNode allows async aggregates", async () => {
  const config = new Aggregate<number, string>("Async label", async () => await Promise.resolve("ok"));
  const out = await runPerItemLikeEngine(
    new AggregateNode(),
    [{ json: 1 }],
    CoreNodesTestContextFactory.create(config),
  );
  assert.equal(out.main?.[0]?.json, "ok");
});
