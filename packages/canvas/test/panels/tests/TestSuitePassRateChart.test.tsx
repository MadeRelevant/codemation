// @vitest-environment jsdom

/**
 * Unit tests for the pure helpers extracted from TestSuitePassRateChart.tsx.
 * pickEvenlySpacedTickIndices and buildTickLabel are tested directly.
 * The chart render is smoke-tested for the empty-state branch.
 */

import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import {
  pickEvenlySpacedTickIndices,
  buildTickLabel,
  TestSuitePassRateChart,
} from "../../../src/panels/tests/TestSuitePassRateChart";

// --- pickEvenlySpacedTickIndices ---

describe("pickEvenlySpacedTickIndices", () => {
  it("returns [] for 0 points", () => {
    expect([...pickEvenlySpacedTickIndices(0)]).toEqual([]);
  });

  it("returns [0] for 1 point", () => {
    expect([...pickEvenlySpacedTickIndices(1)]).toEqual([0]);
  });

  it("returns all indices when pointCount <= maxTicks", () => {
    expect([...pickEvenlySpacedTickIndices(3)]).toEqual([0, 1, 2]);
    expect([...pickEvenlySpacedTickIndices(5)]).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns 5 evenly-spaced indices for 10 points (default maxTicks=5)", () => {
    const result = pickEvenlySpacedTickIndices(10);
    // step = 9/4 = 2.25 → [0, 2, 5, 7, 9]
    expect(result.length).toBe(5);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(9);
  });

  it("respects a custom maxTicks", () => {
    const result = pickEvenlySpacedTickIndices(10, 3);
    expect(result.length).toBe(3);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(9);
  });

  it("deduplicates indices via Set", () => {
    // 2 points, maxTicks=5 → only 2 points exist → all indices returned = [0,1]
    const result = pickEvenlySpacedTickIndices(2, 5);
    expect([...result]).toEqual([0, 1]);
  });
});

// --- buildTickLabel ---

describe("buildTickLabel", () => {
  it("returns empty string formatter for empty array", () => {
    const fmt = buildTickLabel([]);
    expect(fmt(0)).toBe("");
    expect(fmt(5)).toBe("");
  });

  it("returns HH:MM when all runs are on the same day", () => {
    const sameDay = ["2024-03-15T08:00:00.000Z", "2024-03-15T10:30:00.000Z", "2024-03-15T14:45:00.000Z"];
    const fmt = buildTickLabel(sameDay);
    // Should be time-only, no date prefix
    const label = fmt(1);
    // Must NOT contain "/" (no date component)
    expect(label).not.toMatch(/^\d+\/\d+/);
    // Must contain ":" (HH:MM)
    expect(label).toContain(":");
  });

  it("returns M/D HH:MM when runs span multiple days", () => {
    const multiDay = ["2024-03-14T08:00:00.000Z", "2024-03-15T14:00:00.000Z"];
    const fmt = buildTickLabel(multiDay);
    const label0 = fmt(0);
    const label1 = fmt(1);
    // Both should contain "/" date component
    expect(label0).toMatch(/\d+\/\d+/);
    expect(label1).toMatch(/\d+\/\d+/);
  });

  it("returns empty string for out-of-bounds index", () => {
    const fmt = buildTickLabel(["2024-03-15T10:00:00.000Z"]);
    expect(fmt(99)).toBe("");
  });
});

// --- TestSuitePassRateChart empty-state branch ---

describe("TestSuitePassRateChart", () => {
  it("renders empty-state message when suiteRuns is empty", () => {
    const { container } = render(<TestSuitePassRateChart suiteRuns={[]} />);
    expect(container.textContent).toContain("No test suite runs yet");
  });

  it("renders chart container when suiteRuns has entries", () => {
    const run = {
      id: "sr-1",
      workflowId: "wf-1",
      triggerNodeId: "node-1",
      status: "completed" as const,
      startedAt: "2024-03-15T10:00:00.000Z",
      totalCases: 4,
      passedCases: 3,
      failedCases: 1,
    };
    const { container } = render(<TestSuitePassRateChart suiteRuns={[run]} />);
    // Should NOT show empty-state
    expect(container.textContent).not.toContain("No test suite runs yet");
    // Should render chart wrapper div
    expect(container.querySelector(".recharts-wrapper, [class*='h-48']")).not.toBeNull();
  });

  it("renders with selectedMetrics for metric overlay branch", () => {
    const run = {
      id: "sr-1",
      workflowId: "wf-1",
      triggerNodeId: "node-1",
      status: "completed" as const,
      startedAt: "2024-03-15T10:00:00.000Z",
      totalCases: 2,
      passedCases: 1,
      failedCases: 1,
    };
    const trend = {
      name: "accuracy",
      perSuiteRun: [{ testSuiteRunId: "sr-1", startedAt: "2024-03-15T10:00:00.000Z", meanScore: 0.8, sampleCount: 2 }],
    };
    expect(() => {
      render(<TestSuitePassRateChart suiteRuns={[run]} selectedMetrics={["accuracy"]} metricTrends={[trend]} />);
    }).not.toThrow();
  });
});
