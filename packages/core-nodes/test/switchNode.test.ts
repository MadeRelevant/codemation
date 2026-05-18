import type { Item } from "@codemation/core";
import { Switch, SwitchNode } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { test } from "vitest";

import { CoreNodesTestContextFactory } from "./testkit/CoreNodesTestContextFactory";
import { runPerItemLikeEngine } from "./engineTestHelpers";

function makeSwitch(cases: string[], defaultCase: string, resolver: (item: Item) => string) {
  return new Switch("Route", { cases, defaultCase, resolveCaseKey: (item) => resolver(item) });
}

test("SwitchNode routes item to the matching case port", async () => {
  const config = makeSwitch(["yes", "no"], "no", (item) => ((item.json as { ok: boolean }).ok ? "yes" : "no"));
  const out = await runPerItemLikeEngine(
    new SwitchNode(),
    [{ json: { ok: true } }, { json: { ok: false } }],
    CoreNodesTestContextFactory.create(config),
  );
  assert.equal(out["yes"]?.length, 1);
  assert.equal(out["no"]?.length, 1);
});

test("SwitchNode falls back to defaultCase when resolved key is not in cases", async () => {
  const config = makeSwitch(["a", "b"], "default", () => "unknown");
  const out = await runPerItemLikeEngine(new SwitchNode(), [{ json: {} }], CoreNodesTestContextFactory.create(config));
  assert.equal(out["default"]?.length, 1);
  assert.equal(out["a"], undefined);
});

test("SwitchNode supports async resolveCaseKey", async () => {
  const config = new Switch("Async route", {
    cases: ["done"],
    defaultCase: "pending",
    resolveCaseKey: async (item) => {
      await Promise.resolve();
      return (item.json as { status: string }).status;
    },
  });
  const out = await runPerItemLikeEngine(
    new SwitchNode(),
    [{ json: { status: "done" } }],
    CoreNodesTestContextFactory.create(config),
  );
  assert.equal(out["done"]?.length, 1);
});

test("SwitchNode tags routed items with originIndex for fan-in merge", async () => {
  const config = makeSwitch(["a"], "a", () => "a");
  const out = await runPerItemLikeEngine(
    new SwitchNode(),
    [{ json: "item0" }, { json: "item1" }],
    CoreNodesTestContextFactory.create(config),
  );
  const items = out["a"] ?? [];
  assert.equal(items.length, 2);
  // Each item should carry paired info for fan-in.
  assert.ok(items[0]?.paired && items[0].paired.length > 0, "First item should have paired metadata");
});

test("Switch config inspectorSummary shows cases and default", () => {
  const config = makeSwitch(["yes", "no"], "no", () => "yes");
  const rows = config.inspectorSummary();
  assert.ok(rows.some((r) => r.label === "Cases" && (r.value as string).includes("yes")));
  assert.ok(rows.some((r) => r.label === "Default" && r.value === "no"));
});

test("Switch config with no cases shows (none) in inspector", () => {
  const config = new Switch("Empty switch", { cases: [], defaultCase: "fallback", resolveCaseKey: () => "x" });
  const rows = config.inspectorSummary();
  const casesRow = rows.find((r) => r.label === "Cases");
  assert.equal(casesRow?.value, "(none)");
});

test("Switch config declaredOutputPorts deduplicates cases and defaultCase", () => {
  const config = new Switch("Dup", { cases: ["a", "b", "a"], defaultCase: "a", resolveCaseKey: () => "a" });
  assert.deepEqual(config.declaredOutputPorts, ["a", "b"]);
});
