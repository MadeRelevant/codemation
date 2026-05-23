// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TestSuiteRunsList } from "../../../src/panels/tests/TestSuiteRunsList";
import type { TestSuiteRunSummaryDto } from "@codemation/host/dto";

function makeSuiteRun(overrides: Partial<TestSuiteRunSummaryDto> = {}): TestSuiteRunSummaryDto {
  return {
    id: "run-1",
    status: "completed",
    triggerNodeId: "t1",
    triggerNodeName: "My Trigger",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    passedCases: 2,
    totalCases: 3,
    ...overrides,
  } as TestSuiteRunSummaryDto;
}

describe("TestSuiteRunsList", () => {
  it("shows empty state when suiteRuns is empty", () => {
    render(<TestSuiteRunsList suiteRuns={[]} selectedTestSuiteRunId={null} onSelect={() => {}} />);
    expect(screen.getByText(/No test suite runs yet/i)).toBeInTheDocument();
  });

  it("renders a row per suite run", () => {
    const runs = [
      makeSuiteRun({ id: "run-1", triggerNodeName: "Trigger A" }),
      makeSuiteRun({ id: "run-2", triggerNodeName: "Trigger B" }),
    ];
    render(<TestSuiteRunsList suiteRuns={runs} selectedTestSuiteRunId={null} onSelect={() => {}} />);
    expect(screen.getByTestId("test-suite-run-row-run-1")).toBeInTheDocument();
    expect(screen.getByTestId("test-suite-run-row-run-2")).toBeInTheDocument();
  });

  it("calls onSelect with the run id when a row is clicked", () => {
    const onSelect = vi.fn();
    const runs = [makeSuiteRun({ id: "run-42" })];
    render(<TestSuiteRunsList suiteRuns={runs} selectedTestSuiteRunId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("test-suite-run-row-run-42"));
    expect(onSelect).toHaveBeenCalledWith("run-42");
  });

  it("applies selected styles when a run is selected", () => {
    const runs = [makeSuiteRun({ id: "run-sel" })];
    render(<TestSuiteRunsList suiteRuns={runs} selectedTestSuiteRunId="run-sel" onSelect={() => {}} />);
    const btn = screen.getByTestId("test-suite-run-row-run-sel");
    expect(btn.className).toContain("bg-muted/60");
  });

  it("shows singular 'case' when totalCases is 1", () => {
    const runs = [makeSuiteRun({ id: "run-1", passedCases: 1, totalCases: 1 })];
    render(<TestSuiteRunsList suiteRuns={runs} selectedTestSuiteRunId={null} onSelect={() => {}} />);
    expect(screen.getByText(/1\/1 test case passed/)).toBeInTheDocument();
  });

  it("falls back to triggerNodeId when triggerNodeName is absent", () => {
    const runs = [makeSuiteRun({ id: "run-1", triggerNodeName: undefined, triggerNodeId: "trig-node-id" })];
    render(<TestSuiteRunsList suiteRuns={runs} selectedTestSuiteRunId={null} onSelect={() => {}} />);
    expect(screen.getByText("trig-node-id")).toBeInTheDocument();
  });
});
