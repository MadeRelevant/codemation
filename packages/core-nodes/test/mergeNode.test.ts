import type { Item } from "@codemation/core";
import { Merge, MergeNode } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { test } from "vitest";
import { CoreNodesTestContextFactory } from "./testkit/CoreNodesTestContextFactory";

function makeItem(json: unknown, originIndex?: number): Item {
  if (originIndex === undefined) return { json };
  return {
    json,
    meta: { _cm: { originIndex } },
    paired: [{ nodeId: "upstream", output: "$in", itemIndex: originIndex }],
  };
}

test("MergeNode append mode concatenates all inputs in prefer order", async () => {
  const config = new Merge("Merge", { mode: "append", prefer: ["left", "right"] });
  const node = new MergeNode();
  const ctx = CoreNodesTestContextFactory.create(config);

  const result = await node.executeMulti(
    {
      left: [makeItem("a"), makeItem("b")],
      right: [makeItem("c")],
    },
    ctx,
  );

  assert.deepEqual(
    result.main?.map((i) => i.json),
    ["a", "b", "c"],
  );
});

test("MergeNode append mode respects prefer order (right before left)", async () => {
  const config = new Merge("Merge", { mode: "append", prefer: ["right", "left"] });
  const node = new MergeNode();
  const ctx = CoreNodesTestContextFactory.create(config);

  const result = await node.executeMulti(
    {
      left: [makeItem("a")],
      right: [makeItem("b")],
    },
    ctx,
  );

  assert.deepEqual(
    result.main?.map((i) => i.json),
    ["b", "a"],
  );
});

test("MergeNode mergeByPosition mode zips inputs by position", async () => {
  const config = new Merge<{ n: number }, { left?: number; right?: number }>("Merge", {
    mode: "mergeByPosition",
    prefer: ["left", "right"],
  });
  const node = new MergeNode();
  const ctx = CoreNodesTestContextFactory.create(config);

  const result = await node.executeMulti(
    {
      left: [makeItem({ n: 1 }), makeItem({ n: 2 })],
      right: [makeItem({ n: 3 })],
    },
    ctx,
  );

  assert.equal(result.main?.length, 2);
  assert.deepEqual((result.main?.[0]?.json as Record<string, unknown>)["left"], { n: 1 });
  assert.deepEqual((result.main?.[0]?.json as Record<string, unknown>)["right"], { n: 3 });
  // second position: right has no item at index 1 — value is undefined
  assert.deepEqual((result.main?.[1]?.json as Record<string, unknown>)["left"], { n: 2 });
});

test("MergeNode passThrough mode deduplicates by originIndex", async () => {
  const config = new Merge("Merge", { mode: "passThrough" });
  const node = new MergeNode();
  const ctx = CoreNodesTestContextFactory.create(config);

  // Both branches emit the same originIndex — first branch wins.
  const result = await node.executeMulti(
    {
      left: [makeItem("from-left", 0), makeItem("from-left", 1)],
      right: [makeItem("from-right", 0)],
    },
    ctx,
  );

  assert.deepEqual(
    result.main?.map((i) => i.json),
    ["from-left", "from-left"],
  );
});

test("MergeNode passThrough mode handles items without origin (fallback path)", async () => {
  const config = new Merge("Merge", { mode: "passThrough" });
  const node = new MergeNode();
  const ctx = CoreNodesTestContextFactory.create(config);

  const result = await node.executeMulti(
    {
      left: [makeItem("no-origin")],
    },
    ctx,
  );

  assert.deepEqual(
    result.main?.map((i) => i.json),
    ["no-origin"],
  );
});

test("MergeNode passThrough mode with empty inputs returns empty main", async () => {
  const config = new Merge("Merge", { mode: "passThrough" });
  const node = new MergeNode();
  const ctx = CoreNodesTestContextFactory.create(config);

  const result = await node.executeMulti({ left: [], right: [] }, ctx);
  assert.deepEqual(result.main, []);
});

test("Merge config inspectorSummary shows mode and prefer when set", () => {
  const config = new Merge("Merge", { mode: "append", prefer: ["a", "b"] });
  const rows = config.inspectorSummary();
  assert.ok(rows.some((r) => r.label === "Mode" && r.value === "append"));
  assert.ok(rows.some((r) => r.label === "Input order" && (r.value as string).includes("a")));
});

test("Merge config inspectorSummary omits prefer row when prefer is empty", () => {
  const config = new Merge("Merge", { mode: "passThrough" });
  const rows = config.inspectorSummary();
  assert.ok(!rows.some((r) => r.label === "Input order"));
});
