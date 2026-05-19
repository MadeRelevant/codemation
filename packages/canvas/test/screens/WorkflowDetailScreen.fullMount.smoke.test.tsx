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

import { render, screen } from "@testing-library/react";
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
});
