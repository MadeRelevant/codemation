// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWorkflowCanvasApiClient, WorkflowCanvasApiClientProvider } from "@codemation/canvas-core";

import { WorkflowDetailScreenTestsView } from "../../src/screens/WorkflowDetailScreenTestsView";

const neverResolveFetch: typeof globalThis.fetch = () => new Promise(() => {});

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const client = createWorkflowCanvasApiClient({ apiBase: "", getToken: () => null, fetch: neverResolveFetch });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <WorkflowCanvasApiClientProvider value={client}>{children}</WorkflowCanvasApiClientProvider>
      </QueryClientProvider>
    );
  };
}

const Wrapper = makeWrapper();

// Minimal props — TestsPanel requires workflowId and workflowNodes
const BASE_PROPS = {
  workflowId: "wf-123",
  workflowNodes: [],
  onSwitchToLive: vi.fn(),
  onSwitchToExecutions: vi.fn(),
};

describe("WorkflowDetailScreenTestsView", () => {
  it("renders Live workflow tab button", () => {
    render(<WorkflowDetailScreenTestsView {...BASE_PROPS} />, { wrapper: Wrapper });
    expect(screen.getByTestId("workflow-canvas-tab-live")).toBeInTheDocument();
  });

  it("renders Executions tab button", () => {
    render(<WorkflowDetailScreenTestsView {...BASE_PROPS} />, { wrapper: Wrapper });
    expect(screen.getByTestId("workflow-canvas-tab-executions")).toBeInTheDocument();
  });

  it("renders Tests tab button as active (aria-pressed)", () => {
    render(<WorkflowDetailScreenTestsView {...BASE_PROPS} />, { wrapper: Wrapper });
    const testsTab = screen.getByTestId("workflow-canvas-tab-tests");
    expect(testsTab).toBeInTheDocument();
    expect(testsTab.getAttribute("aria-pressed")).toBeTruthy();
  });

  it("calls onSwitchToLive when Live workflow tab is clicked", () => {
    const onSwitchToLive = vi.fn();
    render(<WorkflowDetailScreenTestsView {...BASE_PROPS} onSwitchToLive={onSwitchToLive} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTestId("workflow-canvas-tab-live"));
    expect(onSwitchToLive).toHaveBeenCalled();
  });

  it("calls onSwitchToExecutions when Executions tab is clicked", () => {
    const onSwitchToExecutions = vi.fn();
    render(<WorkflowDetailScreenTestsView {...BASE_PROPS} onSwitchToExecutions={onSwitchToExecutions} />, {
      wrapper: Wrapper,
    });
    fireEvent.click(screen.getByTestId("workflow-canvas-tab-executions"));
    expect(onSwitchToExecutions).toHaveBeenCalled();
  });
});
