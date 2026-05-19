// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

// resolveRunListDisplayedStatus is not exported — test it indirectly via test helpers
// We test the pure function by importing the module and calling the logic directly.
// Since the function is private, we replicate the logic here for unit testing and rely on
// coverage coming from the render path. But we also need branch coverage on the pure fn.
//
// The simplest approach: re-implement the same logic and verify our understanding matches
// the source. But that doesn't give us coverage of the actual file.
//
// Instead: render the component and observe `data-testid="run-status-<id>"` for the displayed status.

import { render } from "@testing-library/react";
import type { RunSummary } from "@codemation/canvas";

// We'll test resolveRunListDisplayedStatus indirectly by rendering WorkflowRunsList
// and checking the data-testid span that holds the displayedStatus string.
import { WorkflowRunsList } from "../../src/panels/WorkflowRunsList";

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    status: "completed",
    startedAt: "2024-01-01T00:00:00Z",
    finishedAt: "2024-01-01T00:01:00Z",
    executionOptions: undefined,
    ...overrides,
  } as RunSummary;
}

const noop = () => "";
const noopMode = () => null;
const noopSelect = () => {};

function renderList(run: RunSummary) {
  return render(
    WorkflowRunsList({
      displayedRuns: [run],
      runsError: null,
      selectedRunId: null,
      formatRunListWhen: noop,
      formatRunListDurationLine: noop,
      getExecutionModeLabel: noopMode,
      onSelectRun: noopSelect,
    }),
  );
}

function getStatusText(container: HTMLElement, runId: string): string {
  const span = container.querySelector(`[data-testid="run-status-${runId}"]`);
  return span?.textContent ?? "";
}

describe("resolveRunListDisplayedStatus (via WorkflowRunsList render)", () => {
  it("no testCaseStatus: returns engine status verbatim", () => {
    const run = makeRun({ runId: "run-1", status: "completed", testCaseStatus: undefined });
    const { container } = renderList(run);
    expect(getStatusText(container, "run-1")).toBe("completed");
  });

  it("testCaseStatus succeeded → completed", () => {
    const run = makeRun({ runId: "run-1", status: "completed", testCaseStatus: "succeeded" });
    const { container } = renderList(run);
    expect(getStatusText(container, "run-1")).toBe("completed");
  });

  it("testCaseStatus failed → failed", () => {
    const run = makeRun({ runId: "run-1", status: "completed", testCaseStatus: "failed" });
    const { container } = renderList(run);
    expect(getStatusText(container, "run-1")).toBe("failed");
  });

  it("testCaseStatus errored → failed", () => {
    const run = makeRun({ runId: "run-1", status: "completed", testCaseStatus: "errored" });
    const { container } = renderList(run);
    expect(getStatusText(container, "run-1")).toBe("failed");
  });

  it("testCaseStatus cancelled → failed", () => {
    const run = makeRun({ runId: "run-1", status: "completed", testCaseStatus: "cancelled" });
    const { container } = renderList(run);
    expect(getStatusText(container, "run-1")).toBe("failed");
  });

  it("testCaseStatus running → running (pass-through)", () => {
    const run = makeRun({ runId: "run-1", status: "running", testCaseStatus: "running" });
    const { container } = renderList(run);
    expect(getStatusText(container, "run-1")).toBe("running");
  });
});

describe("WorkflowRunsList — render branches", () => {
  it("renders error message when runsError is set", () => {
    const { container } = render(
      WorkflowRunsList({
        displayedRuns: undefined,
        runsError: "Network error",
        selectedRunId: null,
        formatRunListWhen: noop,
        formatRunListDurationLine: noop,
        getExecutionModeLabel: noopMode,
        onSelectRun: noopSelect,
      }),
    );
    expect(container.textContent).toContain("Failed to load executions");
  });

  it("renders loading message when displayedRuns is undefined and no error", () => {
    const { container } = render(
      WorkflowRunsList({
        displayedRuns: undefined,
        runsError: null,
        selectedRunId: null,
        formatRunListWhen: noop,
        formatRunListDurationLine: noop,
        getExecutionModeLabel: noopMode,
        onSelectRun: noopSelect,
      }),
    );
    expect(container.textContent).toContain("Loading executions");
  });

  it("renders empty message when displayedRuns is empty array", () => {
    const { container } = render(
      WorkflowRunsList({
        displayedRuns: [],
        runsError: null,
        selectedRunId: null,
        formatRunListWhen: noop,
        formatRunListDurationLine: noop,
        getExecutionModeLabel: noopMode,
        onSelectRun: noopSelect,
      }),
    );
    expect(container.textContent).toContain("No executions yet");
  });
});
