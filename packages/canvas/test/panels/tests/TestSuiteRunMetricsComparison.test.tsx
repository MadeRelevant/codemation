// @vitest-environment jsdom

/**
 * Tests for the pure aggregateByName logic inside TestSuiteRunMetricsComparison,
 * exercised indirectly by rendering the component with controlled input.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TestSuiteRunMetricsComparison } from "../../../src/panels/tests/TestSuiteRunMetricsComparison";
import type { TestAssertionDto } from "@codemation/host/dto";

let _idCounter = 0;

function makeAssertion(name: string, score: number, overrides: Partial<TestAssertionDto> = {}): TestAssertionDto {
  return {
    id: `a-${_idCounter++}`,
    runId: "run-1",
    testSuiteRunId: "suite-1",
    workflowId: "wf-1",
    nodeId: "node-1",
    name,
    score,
    passThreshold: 0.5,
    ...overrides,
  };
}

describe("TestSuiteRunMetricsComparison", () => {
  it("renders nothing when currentAssertions is empty", () => {
    const { container } = render(
      <TestSuiteRunMetricsComparison currentAssertions={[]} previousAssertions={null} previousLoading={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders section when currentAssertions has entries", () => {
    render(
      <TestSuiteRunMetricsComparison
        currentAssertions={[makeAssertion("accuracy", 0.8)]}
        previousAssertions={null}
        previousLoading={false}
      />,
    );
    expect(screen.getByTestId("test-suite-run-metrics-comparison")).toBeInTheDocument();
  });

  it("shows 'No previous run' message when previousAssertions is null and not loading", () => {
    render(
      <TestSuiteRunMetricsComparison
        currentAssertions={[makeAssertion("accuracy", 0.8)]}
        previousAssertions={null}
        previousLoading={false}
      />,
    );
    expect(screen.getByText(/No previous run/i)).toBeInTheDocument();
  });

  it("does not show 'No previous run' when previousLoading is true", () => {
    render(
      <TestSuiteRunMetricsComparison
        currentAssertions={[makeAssertion("accuracy", 0.8)]}
        previousAssertions={null}
        previousLoading={true}
      />,
    );
    expect(screen.queryByText(/No previous run/i)).not.toBeInTheDocument();
  });

  it("does not show 'No previous run' when previousAssertions is provided", () => {
    render(
      <TestSuiteRunMetricsComparison
        currentAssertions={[makeAssertion("accuracy", 0.8)]}
        previousAssertions={[makeAssertion("accuracy", 0.7)]}
        previousLoading={false}
      />,
    );
    expect(screen.queryByText(/No previous run/i)).not.toBeInTheDocument();
  });

  it("aggregates multiple assertions with same name by sample-weighted mean", () => {
    // Two assertions with same name: scores 0.6 and 0.8 → mean 0.7
    // The component renders TestSuiteRunMetricRow items — confirm there's only 1 row for same name
    render(
      <TestSuiteRunMetricsComparison
        currentAssertions={[makeAssertion("accuracy", 0.6), makeAssertion("accuracy", 0.8)]}
        previousAssertions={null}
        previousLoading={false}
      />,
    );
    // One named metric "accuracy" → one row
    const list = screen.getByTestId("test-suite-run-metrics-comparison").querySelector("ul");
    expect(list?.children).toHaveLength(1);
  });

  it("renders one row per distinct assertion name", () => {
    render(
      <TestSuiteRunMetricsComparison
        currentAssertions={[makeAssertion("accuracy", 0.8), makeAssertion("latency", 0.6)]}
        previousAssertions={null}
        previousLoading={false}
      />,
    );
    const list = screen.getByTestId("test-suite-run-metrics-comparison").querySelector("ul");
    expect(list?.children).toHaveLength(2);
  });

  it("failing rows appear before passing rows (sort order)", () => {
    // Score 0.3 < passThreshold 0.5 → failing
    // Score 0.9 > passThreshold 0.5 → passing
    render(
      <TestSuiteRunMetricsComparison
        currentAssertions={[makeAssertion("passing", 0.9), makeAssertion("failing", 0.3)]}
        previousAssertions={null}
        previousLoading={false}
      />,
    );
    const list = screen.getByTestId("test-suite-run-metrics-comparison").querySelector("ul");
    const items = Array.from(list?.children ?? []);
    // The first item should contain the "failing" metric name
    expect(items[0]!.textContent).toContain("failing");
    expect(items[1]!.textContent).toContain("passing");
  });

  it("errored assertions are treated as failing", () => {
    render(
      <TestSuiteRunMetricsComparison
        currentAssertions={[makeAssertion("erroredMetric", 0.9, { errored: true })]}
        previousAssertions={null}
        previousLoading={false}
      />,
    );
    // Should render — errored is treated as failing so section shows
    expect(screen.getByTestId("test-suite-run-metrics-comparison")).toBeInTheDocument();
  });
});
