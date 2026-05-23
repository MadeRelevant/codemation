import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TestAssertionsList } from "../../../src/panels/tests/TestAssertionsList";
import type { TestAssertionDto } from "@codemation/host/dto";

function makeAssertion(overrides: Partial<TestAssertionDto> = {}): TestAssertionDto {
  return {
    id: "a1",
    runId: "run1",
    testSuiteRunId: "tsr1",
    workflowId: "wf1",
    nodeId: "node1",
    name: "Test assertion",
    score: 1,
    passThreshold: 0.5,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("TestAssertionsList", () => {
  it("shows empty message when no assertions", () => {
    render(<TestAssertionsList assertions={[]} />);
    expect(screen.getByText(/No assertions emitted/)).toBeInTheDocument();
  });

  it("renders a flat list when groupByRun is false", () => {
    const assertions = [
      makeAssertion({ id: "a1", name: "Assertion 1", score: 1 }),
      makeAssertion({ id: "a2", name: "Assertion 2", score: 0 }),
    ];
    render(<TestAssertionsList assertions={assertions} />);
    expect(screen.getByText("Assertion 1")).toBeInTheDocument();
    expect(screen.getByText("Assertion 2")).toBeInTheDocument();
  });

  it("renders grouped by run when groupByRun is true", () => {
    const assertions = [
      makeAssertion({ id: "a1", runId: "run1", name: "Assertion 1", score: 1 }),
      makeAssertion({ id: "a2", runId: "run2", name: "Assertion 2", score: 0 }),
    ];
    render(<TestAssertionsList assertions={assertions} groupByRun />);
    // Both run IDs should appear (first 12 chars shown)
    expect(screen.getByText(/run: run1/)).toBeInTheDocument();
    expect(screen.getByText(/run: run2/)).toBeInTheDocument();
  });

  it("shows pass count in grouped view", () => {
    const assertions = [
      makeAssertion({ id: "a1", runId: "run1", score: 1, scoreThreshold: 0.5 }),
      makeAssertion({ id: "a2", runId: "run1", score: 0, scoreThreshold: 0.5 }),
    ];
    render(<TestAssertionsList assertions={assertions} groupByRun />);
    // 1 passed out of 2
    expect(screen.getByText("1/2 passed")).toBeInTheDocument();
  });
});
