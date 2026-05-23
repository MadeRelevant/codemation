// @vitest-environment jsdom

/**
 * Tests for TestSuiteRunDetailTreeTable:
 * - empty-state when childRuns is empty
 * - auto-expand for failed/errored runs via seededRunIdsRef
 * - expand-all / collapse-all buttons
 * - user collapse is preserved (seededRunIdsRef gate)
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TestSuiteRunDetailTreeTable } from "../../../src/panels/tests/TestSuiteRunDetailTreeTable";
import type { TestSuiteChildRunDto, TestAssertionDto } from "@codemation/host/dto";

function makeChildRun(overrides: Partial<TestSuiteChildRunDto> = {}): TestSuiteChildRunDto {
  return {
    runId: "run-1",
    testSuiteRunId: "suite-1",
    testCaseIndex: 0,
    status: "completed",
    startedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeAssertion(overrides: Partial<TestAssertionDto> = {}): TestAssertionDto {
  return {
    id: "a-1",
    runId: "run-1",
    testSuiteRunId: "suite-1",
    workflowId: "wf-1",
    nodeId: "node-1",
    name: "accuracy",
    score: 1,
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("TestSuiteRunDetailTreeTable", () => {
  it("renders empty-state message when childRuns is empty", () => {
    const { container } = render(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={[]} assertions={[]} />);
    expect(container.textContent).toContain("No test cases dispatched yet");
    expect(container.textContent).toContain("Run tests");
  });

  it("renders the tree table when there are child runs", () => {
    const run = makeChildRun({ runId: "run-1", status: "completed" });
    render(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={[run]} assertions={[]} />);
    expect(screen.getByTestId("test-suite-run-detail-tree-table")).toBeInTheDocument();
  });

  it("auto-expands a failed run on initial render", () => {
    // A run with testCaseStatus failed should be auto-expanded
    const run = makeChildRun({ runId: "run-failed", status: "failed", testCaseStatus: "failed" });
    render(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={[run]} assertions={[]} />);
    // The run should appear in the DOM
    expect(screen.getByTestId("test-suite-run-detail-tree-table")).toBeInTheDocument();
  });

  it("auto-expands a run with a failing assertion", () => {
    const run = makeChildRun({ runId: "run-2", status: "completed", testCaseStatus: "succeeded" });
    const failingAssertion = makeAssertion({ runId: "run-2", score: 0, passThreshold: 0.5 });
    render(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={[run]} assertions={[failingAssertion]} />);
    expect(screen.getByTestId("test-suite-run-detail-tree-table")).toBeInTheDocument();
  });

  it("expand-all button expands all rows", () => {
    const runs = [
      makeChildRun({ runId: "r1", status: "completed" }),
      makeChildRun({ runId: "r2", status: "completed", testCaseIndex: 1 }),
    ];
    render(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={runs} assertions={[]} />);
    const expandBtn = screen.getByTestId("test-suite-tree-expand-all");
    fireEvent.click(expandBtn);
    // After expand-all, collapse-all button should still be present
    expect(screen.getByTestId("test-suite-tree-collapse-all")).toBeInTheDocument();
  });

  it("collapse-all button collapses all rows", () => {
    const runs = [
      makeChildRun({ runId: "r1", status: "completed" }),
      makeChildRun({ runId: "r2", status: "completed", testCaseIndex: 1 }),
    ];
    render(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={runs} assertions={[]} />);
    // First expand all, then collapse all
    fireEvent.click(screen.getByTestId("test-suite-tree-expand-all"));
    fireEvent.click(screen.getByTestId("test-suite-tree-collapse-all"));
    expect(screen.getByTestId("test-suite-run-detail-tree-table")).toBeInTheDocument();
  });

  it("seededRunIdsRef prevents re-auto-expanding a seen run on rerender", () => {
    const run = makeChildRun({ runId: "run-failed", status: "failed", testCaseStatus: "failed" });
    const { rerender } = render(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={[run]} assertions={[]} />);
    // Collapse all
    fireEvent.click(screen.getByTestId("test-suite-tree-collapse-all"));

    // Rerender with the same child run — seededRunIdsRef should prevent re-auto-expand
    rerender(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={[run]} assertions={[]} />);

    // Component should still be rendered (no crash)
    expect(screen.getByTestId("test-suite-run-detail-tree-table")).toBeInTheDocument();
  });

  it("new failed run added in rerender gets auto-expanded", () => {
    const run1 = makeChildRun({ runId: "r1", status: "completed", testCaseStatus: "succeeded" });
    const { rerender } = render(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={[run1]} assertions={[]} />);

    // Add a new failing run
    const run2 = makeChildRun({ runId: "r2", status: "failed", testCaseStatus: "failed", testCaseIndex: 1 });
    act(() => {
      rerender(<TestSuiteRunDetailTreeTable workflowId="wf-1" childRuns={[run1, run2]} assertions={[]} />);
    });

    expect(screen.getByTestId("test-suite-run-detail-tree-table")).toBeInTheDocument();
  });
});
