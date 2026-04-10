import assert from "node:assert/strict";
import { test } from "vitest";

import type { Item, NodeInputsByPort } from "../../src/index.ts";
import { FanInMergeByOriginMerger } from "../../src/execution/FanInMergeByOriginMerger.ts";

function withOrigin(item: Item, originIndex: number): Item {
  return {
    ...item,
    meta: { _cm: { originIndex } },
  };
}

test("FanInMergeByOriginMerger: single port passes through", () => {
  const m = new FanInMergeByOriginMerger();
  const a: Item = { json: { x: 1 } };
  const out = m.merge({ A: [a] });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0]?.json, { x: 1 });
});

test("FanInMergeByOriginMerger: empty ports yields empty", () => {
  const m = new FanInMergeByOriginMerger();
  assert.deepEqual(m.merge({}), []);
});

test("FanInMergeByOriginMerger: appends across ports when no origin metadata", () => {
  const m = new FanInMergeByOriginMerger();
  const inputs: NodeInputsByPort = {
    B: [{ json: { b: 1 } }, { json: { b: 2 } }],
    C: [{ json: { c: 10 } }, { json: { c: 20 } }],
  };
  const out = m.merge(inputs);
  assert.equal(out.length, 4);
  assert.deepEqual(
    out.map((i) => i.json),
    [{ b: 1 }, { b: 2 }, { c: 10 }, { c: 20 }],
  );
});

test("FanInMergeByOriginMerger: sorts by origin index when present (preserves payloads)", () => {
  const m = new FanInMergeByOriginMerger();
  const inputs: NodeInputsByPort = {
    B: [withOrigin({ json: { b: 1 } }, 1), withOrigin({ json: { b: 2 } }, 0)],
    C: [withOrigin({ json: { c: 10 } }, 0), withOrigin({ json: { c: 20 } }, 1)],
  };
  const out = m.merge(inputs);
  assert.deepEqual(
    out.map((i) => i.json),
    [{ b: 2 }, { c: 10 }, { b: 1 }, { c: 20 }],
  );
});

test("FanInMergeByOriginMerger: preserves paired on items", () => {
  const m = new FanInMergeByOriginMerger();
  const inputs: NodeInputsByPort = {
    B: [withOrigin({ json: { b: 1 }, paired: [{ nodeId: "n1", output: "main", itemIndex: 0 }] }, 0)],
    C: [withOrigin({ json: { c: 2 }, paired: [{ nodeId: "n2", output: "main", itemIndex: 0 }] }, 0)],
  };
  const out = m.merge(inputs);
  assert.equal(out[0]?.paired?.length, 1);
  assert.equal(out[1]?.paired?.length, 1);
});
