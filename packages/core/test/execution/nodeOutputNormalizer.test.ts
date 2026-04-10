import assert from "node:assert/strict";
import { test } from "vitest";

import type { Item } from "../../src/index.ts";
import { emitPorts } from "../../src/index.ts";
import { NodeOutputNormalizer } from "../../src/execution/NodeOutputNormalizer.ts";

class TestItemFactory {
  static baseItem(): Item {
    return {
      json: { base: true },
      meta: { from: "base" },
      paired: [{ nodeId: "A", output: "main", itemIndex: 0 }],
      binary: { file: { mimeType: "text/plain", data: Buffer.from("x").toString("base64") } } as never,
    };
  }
}

test("NodeOutputNormalizer: wraps primitive/JSON output on main and applies carryThrough", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const out = normalizer.normalizeExecuteResult({ baseItem: base, raw: { ok: true }, carry: "carryThrough" });

  assert.equal(out.main?.length, 1);
  assert.deepEqual(out.main?.[0]?.json, { ok: true });
  assert.deepEqual(out.main?.[0]?.meta, { from: "base" });
  assert.deepEqual(out.main?.[0]?.paired, base.paired);
  assert.deepEqual(out.main?.[0]?.binary, base.binary);
});

test("NodeOutputNormalizer: does not carry base lineage for emitOnly", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const out = normalizer.normalizeExecuteResult({
    baseItem: base,
    raw: { json: { ok: true }, meta: { from: "next" } },
    carry: "emitOnly",
  });

  assert.equal(out.main?.length, 1);
  assert.deepEqual(out.main?.[0]?.json, { ok: true });
  assert.deepEqual(out.main?.[0]?.meta, { from: "next" });
  assert.equal(out.main?.[0]?.paired, undefined);
  assert.equal(out.main?.[0]?.binary, undefined);
});

test("NodeOutputNormalizer: supports emitPorts multi-port payloads and applies lineage rules", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const raw = emitPorts({
    true: [{ json: { ok: true } }],
    false: [{ json: { ok: false }, meta: { from: "next" } }],
  });
  const out = normalizer.normalizeExecuteResult({ baseItem: base, raw, carry: "carryThrough" });

  assert.deepEqual(out.true?.[0]?.json, { ok: true });
  assert.deepEqual(out.true?.[0]?.meta, { from: "base" });

  assert.deepEqual(out.false?.[0]?.json, { ok: false });
  assert.deepEqual(out.false?.[0]?.meta, { from: "next" });
});

test("NodeOutputNormalizer: rejects unbranded ports-shaped objects", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  assert.throws(
    () =>
      normalizer.normalizeExecuteResult({
        baseItem: base,
        raw: { ports: { main: [{ json: { ok: true } }] } },
        carry: "emitOnly",
      }),
    /unbranded `\{ ports: \.\.\. \}` object/i,
  );
});

test("NodeOutputNormalizer: fans out arrays to main and rejects nested arrays", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const ok = normalizer.normalizeExecuteResult({ baseItem: base, raw: [{ n: 1 }, { n: 2 }], carry: "emitOnly" });
  assert.equal(ok.main?.length, 2);
  assert.deepEqual(
    ok.main?.map((i) => i.json),
    [{ n: 1 }, { n: 2 }],
  );

  assert.throws(
    () => normalizer.normalizeExecuteResult({ baseItem: base, raw: [[1]], carry: "emitOnly" }),
    /fan-out arrays must contain only non-array JSON elements/i,
  );
});
