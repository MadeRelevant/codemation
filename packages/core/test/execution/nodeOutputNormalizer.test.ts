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

class BehaviorFactory {
  static create(keepBinaries: boolean): Readonly<{ keepBinaries: boolean }> {
    return { keepBinaries };
  }
}

test("NodeOutputNormalizer: plain JSON emits a fresh item when keepBinaries is disabled", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const out = normalizer.normalizeExecuteResult({
    baseItem: base,
    raw: { ok: true },
    behavior: BehaviorFactory.create(false),
  });

  assert.equal(out.main?.length, 1);
  assert.deepEqual(out.main?.[0]?.json, { ok: true });
  assert.equal(out.main?.[0]?.meta, undefined);
  assert.equal(out.main?.[0]?.paired, undefined);
  assert.equal(out.main?.[0]?.binary, undefined);
});

test("NodeOutputNormalizer: plain JSON inherits input binary when keepBinaries is enabled", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const out = normalizer.normalizeExecuteResult({
    baseItem: base,
    raw: { ok: true },
    behavior: BehaviorFactory.create(true),
  });

  assert.equal(out.main?.length, 1);
  assert.deepEqual(out.main?.[0]?.json, { ok: true });
  assert.deepEqual(out.main?.[0]?.binary, base.binary);
  assert.equal(out.main?.[0]?.meta, undefined);
  assert.equal(out.main?.[0]?.paired, undefined);
});

test("NodeOutputNormalizer: explicit item binary wins over inherited binary", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();
  const replacementBinary = { replacement: { mimeType: "application/pdf", id: "pdf" } } as never;

  const out = normalizer.normalizeExecuteResult({
    baseItem: base,
    raw: { json: { ok: true }, binary: replacementBinary, meta: { from: "next" } },
    behavior: BehaviorFactory.create(true),
  });

  assert.equal(out.main?.length, 1);
  assert.deepEqual(out.main?.[0]?.binary, replacementBinary);
  assert.deepEqual(out.main?.[0]?.meta, { from: "next" });
  assert.equal(out.main?.[0]?.paired, undefined);
});

test("NodeOutputNormalizer: item-shaped results inherit binary when omitted and keepBinaries is enabled", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const out = normalizer.normalizeExecuteResult({
    baseItem: base,
    raw: { json: { ok: true }, meta: { from: "next" } },
    behavior: BehaviorFactory.create(true),
  });

  assert.equal(out.main?.length, 1);
  assert.deepEqual(out.main?.[0]?.json, { ok: true });
  assert.deepEqual(out.main?.[0]?.binary, base.binary);
  assert.deepEqual(out.main?.[0]?.meta, { from: "next" });
  assert.equal(out.main?.[0]?.paired, undefined);
});

test("NodeOutputNormalizer: explicit empty binary clears inherited binaries", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const out = normalizer.normalizeExecuteResult({
    baseItem: base,
    raw: { json: { ok: true }, binary: {} },
    behavior: BehaviorFactory.create(true),
  });

  assert.equal(out.main?.length, 1);
  assert.deepEqual(out.main?.[0]?.binary, {});
});

test("NodeOutputNormalizer: emitPorts keeps explicit item metadata while inheriting binary when enabled", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const raw = emitPorts({
    true: [{ json: { ok: true } }],
    false: [{ json: { ok: false }, meta: { from: "next" }, paired: [{ nodeId: "B", output: "alt", itemIndex: 1 }] }],
  });
  const out = normalizer.normalizeExecuteResult({
    baseItem: base,
    raw,
    behavior: BehaviorFactory.create(true),
  });

  assert.deepEqual(out.true?.[0]?.json, { ok: true });
  assert.deepEqual(out.true?.[0]?.binary, base.binary);
  assert.equal(out.true?.[0]?.meta, undefined);

  assert.deepEqual(out.false?.[0]?.json, { ok: false });
  assert.deepEqual(out.false?.[0]?.binary, base.binary);
  assert.deepEqual(out.false?.[0]?.meta, { from: "next" });
  assert.deepEqual(out.false?.[0]?.paired, [{ nodeId: "B", output: "alt", itemIndex: 1 }]);
});

test("NodeOutputNormalizer: rejects unbranded ports-shaped objects", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  assert.throws(
    () =>
      normalizer.normalizeExecuteResult({
        baseItem: base,
        raw: { ports: { main: [{ json: { ok: true } }] } },
        behavior: BehaviorFactory.create(false),
      }),
    /unbranded `\{ ports: \.\.\. \}` object/i,
  );
});

test("NodeOutputNormalizer: fans out arrays to main and preserves binary when enabled", () => {
  const normalizer = new NodeOutputNormalizer();
  const base = TestItemFactory.baseItem();

  const ok = normalizer.normalizeExecuteResult({
    baseItem: base,
    raw: [{ n: 1 }, { n: 2 }],
    behavior: BehaviorFactory.create(true),
  });
  assert.equal(ok.main?.length, 2);
  assert.deepEqual(
    ok.main?.map((i) => i.json),
    [{ n: 1 }, { n: 2 }],
  );
  assert.deepEqual(ok.main?.map((i) => i.binary), [base.binary, base.binary]);

  assert.throws(
    () =>
      normalizer.normalizeExecuteResult({
        baseItem: base,
        raw: [[1]],
        behavior: BehaviorFactory.create(false),
      }),
    /fan-out arrays must contain only non-array JSON elements/i,
  );
});
