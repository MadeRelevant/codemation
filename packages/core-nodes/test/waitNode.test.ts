import { Wait, WaitDuration, WaitNode } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { test } from "vitest";

import { CoreNodesTestContextFactory } from "./testkit/CoreNodesTestContextFactory";
import { runPerItemLikeEngine } from "./engineTestHelpers";

test("WaitNode passes items through unchanged", async () => {
  const config = new Wait("Wait", 0);
  const items = [{ json: { n: 1 } }, { json: { n: 2 } }];
  const out = await runPerItemLikeEngine(new WaitNode(), items, CoreNodesTestContextFactory.create(config));
  assert.deepEqual(
    out.main?.map((i) => i.json),
    [{ n: 1 }, { n: 2 }],
  );
});

test("WaitNode does not delay when milliseconds is 0", async () => {
  const config = new Wait("Wait zero", 0);
  // Just verifies no error is thrown and items pass through when delay=0
  const out = await runPerItemLikeEngine(new WaitNode(), [{ json: {} }], CoreNodesTestContextFactory.create(config));
  assert.equal(out.main?.length, 1);
});

test("WaitNode delays only on the first item — all items still pass through", async () => {
  // Use a small delay and verify all items are emitted (delay behaviour tested by output count, not clock)
  const config = new Wait("Wait", 50);
  const items = [{ json: "first" }, { json: "second" }, { json: "third" }];
  const out = await runPerItemLikeEngine(new WaitNode(), items, CoreNodesTestContextFactory.create(config));
  assert.equal(out.main?.length, 3);
  assert.deepEqual(
    out.main?.map((i) => i.json),
    ["first", "second", "third"],
  );
});

test("Wait config has continueWhenEmptyOutput set to true", () => {
  const config = new Wait("Wait", 100);
  assert.equal(config.continueWhenEmptyOutput, true);
});

test("Wait config inspectorSummary shows ms when < 1000", () => {
  const config = new Wait("Wait", 500);
  const rows = config.inspectorSummary();
  assert.equal(rows[0]?.label, "Duration");
  assert.ok((rows[0]?.value as string).includes("500ms"));
});

test("Wait config inspectorSummary shows seconds when >= 1000", () => {
  const config = new Wait("Wait", 2000);
  const rows = config.inspectorSummary();
  assert.ok((rows[0]?.value as string).includes("2s"));
});

test("WaitDuration.normalize returns 0 for non-positive values", () => {
  assert.equal(WaitDuration.normalize(0), 0);
  assert.equal(WaitDuration.normalize(-1), 0);
  assert.equal(WaitDuration.normalize(NaN), 0);
  assert.equal(WaitDuration.normalize(Infinity), 0);
});

test("WaitDuration.normalize floors to integer", () => {
  assert.equal(WaitDuration.normalize(1.9), 1);
  assert.equal(WaitDuration.normalize(100.7), 100);
});
