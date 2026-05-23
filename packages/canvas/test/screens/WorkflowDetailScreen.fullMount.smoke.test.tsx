// @vitest-environment jsdom

/**
 * Full-mount smoke test for WorkflowDetailScreen.
 *
 * Mounts the real component (not a SlotHarness) with a minimal provider stack.
 * This catches provider-contract drift that the unit slot tests cannot detect.
 *
 * Required providers:
 *   - QueryClientProvider (@tanstack/react-query) — for all useQuery / useMutation hooks
 *   - WorkflowCanvasApiClientProvider — embedded inside WorkflowDetailScreen itself
 *
 * WorkflowDetailScreen wraps itself with WorkflowCanvasApiClientProvider and
 * WorkflowCanvasConfigProvider internally, so we only need to supply the outer
 * QueryClientProvider. The apiClient prop is passed directly to the screen.
 *
 * All API calls use a no-op fetch so the test never hits the network; the component
 * renders in the "loading" (pending queries) state which is enough to confirm the
 * slot wiring doesn't throw during mount.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWorkflowCanvasApiClient, WorkflowCanvasApiClientProvider } from "@codemation/canvas-core";

import { WorkflowDetailScreen } from "../../src/screens/WorkflowDetailScreen";

/**
 * A fetch implementation that never resolves (simulates pending queries).
 * This keeps every React Query query in `loading` state so the component
 * renders the loading branch without crashing.
 */
const neverResolveFetch: typeof globalThis.fetch = () => new Promise(() => {});

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Prevent react-query from complaining about missing window.focus
        refetchOnWindowFocus: false,
      },
    },
  });
}

function makeApiClient() {
  return createWorkflowCanvasApiClient({
    apiBase: "",
    getToken: () => null,
    fetch: neverResolveFetch,
  });
}

describe("WorkflowDetailScreen — full-mount smoke", () => {
  it("mounts without throwing and renders the loading state", () => {
    globalThis.fetch = neverResolveFetch;

    const queryClient = makeQueryClient();
    const apiClient = makeApiClient();

    expect(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <WorkflowCanvasApiClientProvider value={apiClient}>
            <WorkflowDetailScreen workflowId="wf-smoke" apiClient={apiClient} />
          </WorkflowCanvasApiClientProvider>
        </QueryClientProvider>,
      );
    }).not.toThrow();

    // With no initialWorkflow and pending queries, the component renders the loading state
    expect(screen.getByText("Loading diagram…")).toBeInTheDocument();
  });

  it("renders with an initialWorkflow without throwing (slot wiring exercises real component path)", () => {
    globalThis.fetch = neverResolveFetch;

    const queryClient = makeQueryClient();
    const apiClient = makeApiClient();

    const initialWorkflow = {
      id: "wf-smoke",
      name: "Smoke workflow",
      active: false,
      nodes: [],
      edges: [],
    };

    expect(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <WorkflowCanvasApiClientProvider value={apiClient}>
            <WorkflowDetailScreen workflowId="wf-smoke" apiClient={apiClient} initialWorkflow={initialWorkflow} />
          </WorkflowCanvasApiClientProvider>
        </QueryClientProvider>,
      );
    }).not.toThrow();

    // With initialWorkflow provided, the canvas renders (not the loading state)
    // The key confirmation: no exception thrown means slot wiring is intact
    expect(document.body).toBeInTheDocument();
  });

  it("clicking the Tests tab switches to tests view and Live workflow tab switches back", async () => {
    globalThis.fetch = neverResolveFetch;

    const queryClient = makeQueryClient();
    const apiClient = makeApiClient();

    const initialWorkflow = {
      id: "wf-smoke",
      name: "Smoke workflow",
      active: false,
      nodes: [],
      edges: [],
    };

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowCanvasApiClientProvider value={apiClient}>
          <WorkflowDetailScreen workflowId="wf-smoke" apiClient={apiClient} initialWorkflow={initialWorkflow} />
        </WorkflowCanvasApiClientProvider>
      </QueryClientProvider>,
    );

    // The Tests tab button is rendered in the floating tab strip
    const testsTabBtn = screen.getByTestId("workflow-canvas-tab-tests");
    await act(async () => {
      fireEvent.click(testsTabBtn);
    });

    // After clicking Tests tab, the lazy tests view renders (Suspense resolves synchronously in jsdom)
    await waitFor(() => {
      // The tests view shows its own tab strip where "Tests" is the active tab
      expect(screen.getByRole("button", { name: /live workflow/i })).toBeInTheDocument();
    });

    // Click "Live workflow" in the tests view tab strip — triggers onSwitchToLive (lines 160-163)
    const liveBtn = screen.getByRole("button", { name: /live workflow/i });
    await act(async () => {
      fireEvent.click(liveBtn);
    });

    // After switching back to live, the canvas tab strip (floating) should be visible again
    await waitFor(() => {
      expect(screen.getByTestId("workflow-canvas-tab-live")).toBeInTheDocument();
    });
  });

  it("clicking Tests then Executions tab triggers onSwitchToExecutions callback", async () => {
    globalThis.fetch = neverResolveFetch;

    const queryClient = makeQueryClient();
    const apiClient = makeApiClient();

    const initialWorkflow = {
      id: "wf-smoke-2",
      name: "Smoke workflow",
      active: false,
      nodes: [],
      edges: [],
    };

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowCanvasApiClientProvider value={apiClient}>
          <WorkflowDetailScreen workflowId="wf-smoke-2" apiClient={apiClient} initialWorkflow={initialWorkflow} />
        </WorkflowCanvasApiClientProvider>
      </QueryClientProvider>,
    );

    const testsTabBtn = screen.getByTestId("workflow-canvas-tab-tests");
    await act(async () => {
      fireEvent.click(testsTabBtn);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /executions/i })).toBeInTheDocument();
    });

    // Click "Executions" in the tests view — triggers onSwitchToExecutions (lines 164-167)
    const execBtn = screen.getByRole("button", { name: /executions/i });
    await act(async () => {
      fireEvent.click(execBtn);
    });

    // After switching to executions, the canvas tab strip appears with executions as active
    await waitFor(() => {
      expect(screen.getByTestId("workflow-canvas-tab-executions")).toBeInTheDocument();
    });
  });
});
