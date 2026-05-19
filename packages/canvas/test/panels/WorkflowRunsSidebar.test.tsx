// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowRunsSidebar } from "../../src/panels/WorkflowRunsSidebar";

const BASE_FORMATTING = {
  formatRunListDurationLine: (_run: unknown) => "1s",
  formatRunListWhen: (_run: unknown) => "5m ago",
  getExecutionModeLabel: (mode: string) => mode,
};

const BASE_ACTIONS = {
  onSelectRun: vi.fn(),
};

const BASE_MODEL = {
  displayedRuns: [],
  error: null,
  runsError: null,
  selectedRunId: null,
  workflowError: null,
};

describe("WorkflowRunsSidebar", () => {
  it("renders the sidebar container", () => {
    render(<WorkflowRunsSidebar model={BASE_MODEL} actions={BASE_ACTIONS} formatting={BASE_FORMATTING} />);
    expect(screen.getByTestId("workflow-runs-sidebar")).toBeInTheDocument();
  });

  it("shows error message when error is set", () => {
    render(
      <WorkflowRunsSidebar
        model={{ ...BASE_MODEL, error: "Network error" }}
        actions={BASE_ACTIONS}
        formatting={BASE_FORMATTING}
      />,
    );
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("shows workflow error when workflowError is set", () => {
    render(
      <WorkflowRunsSidebar
        model={{ ...BASE_MODEL, workflowError: "Workflow not found" }}
        actions={BASE_ACTIONS}
        formatting={BASE_FORMATTING}
      />,
    );
    expect(screen.getByText("Workflow not found")).toBeInTheDocument();
  });

  it("renders error over workflowError when both are set", () => {
    render(
      <WorkflowRunsSidebar
        model={{ ...BASE_MODEL, error: "Primary error", workflowError: "Workflow error" }}
        actions={BASE_ACTIONS}
        formatting={BASE_FORMATTING}
      />,
    );
    expect(screen.getByText("Primary error")).toBeInTheDocument();
  });

  it("does not show error banner when error and workflowError are null", () => {
    render(<WorkflowRunsSidebar model={BASE_MODEL} actions={BASE_ACTIONS} formatting={BASE_FORMATTING} />);
    expect(screen.queryByText("Network error")).toBeNull();
  });
});
