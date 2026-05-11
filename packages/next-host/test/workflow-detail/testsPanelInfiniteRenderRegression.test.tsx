// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PANEL_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../../canvas/src/panels/tests/TestsPanel.tsx");

/**
 * Regression test for the "Maximum update depth exceeded" loop the user hit in the browser
 * when running a test from the UI: recharts' `ChartDataContextProvider` runs an effect keyed
 * on the data prop's identity, and `TestsPanel` was passing `?? []` inline (fresh empty array
 * per render). New reference → setState → re-render → fresh array → infinite loop.
 *
 * Reliably reproducing the loop in jsdom requires faking layout for `<ResponsiveContainer>`
 * (recharts only mounts the inner LineChart once a non-zero size is reported via
 * ResizeObserver); the `?? []` form is the actual smoking gun and is much cheaper to assert
 * via source inspection. This test is a structural lint: it forbids inline `?? []` /
 * `?? new Array()` fallbacks for the props that flow into the chart, forcing authors to
 * route them through module-scoped stable empties (`EMPTY_SUITE_RUNS`, `EMPTY_METRIC_TRENDS`).
 *
 * If you legitimately need a different fallback shape, add it here AND verify the panel
 * doesn't loop in the dev server — don't just delete the assertion.
 */
describe("TestsPanel — referential-stability lint for the trends chart props", () => {
  const source = readFileSync(PANEL_PATH, "utf8");

  it.each([
    ["suitesQuery.data", "??"],
    ["allMetricsQuery.data", "??"],
    ["selectedMetricsQuery.data", "??"],
  ])("does not pass `%s %s []` inline to a child (use a module-scoped EMPTY_* constant)", (queryDataExpr, op) => {
    // Match `<expr> ?? []` or `<expr> ?? new Array(...)` — both regenerate per render.
    const inlineEmpty = new RegExp(
      `${queryDataExpr.replace(/\./g, "\\.")}\\s*\\${op}\\s*(\\[\\s*\\]|new Array\\()`,
      "g",
    );
    const matches = source.match(inlineEmpty);
    expect(matches, `${queryDataExpr} must not be defaulted with an inline empty literal`).toBeNull();
  });

  it("declares the stable-empty constants the chart consumes", () => {
    // Both fallbacks must exist as module-scoped readonly constants the chart consumes.
    expect(source).toMatch(/const\s+EMPTY_SUITE_RUNS\s*:\s*ReadonlyArray<TestSuiteRunSummaryDto>\s*=\s*\[\];/);
    expect(source).toMatch(/const\s+EMPTY_METRIC_TRENDS\s*:\s*ReadonlyArray<AssertionMetricTrendDto>\s*=\s*\[\];/);
  });

  it("uses those stable empties at every chart-prop callsite", () => {
    expect(source).toContain("suitesQuery.data ?? EMPTY_SUITE_RUNS");
    expect(source).toContain("allMetricsQuery.data ?? EMPTY_METRIC_TRENDS");
    expect(source).toContain("selectedMetricsQuery.data ?? EMPTY_METRIC_TRENDS");
  });
});
