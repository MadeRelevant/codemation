// @vitest-environment jsdom

import { ApiPaths } from "@codemation/host";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardFilterCard } from "../../src/features/dashboard/components/DashboardFilterCard";
import { DashboardScreen } from "../../src/features/dashboard/screens/DashboardScreen";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe("DashboardScreen", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let priorFetch: typeof globalThis.fetch;
  let priorResizeObserver: typeof globalThis.ResizeObserver | undefined;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === ApiPaths.workflows()) {
        return {
          ok: true,
          json: async () => [
            {
              id: "wf.gmail",
              name: "Gmail triage",
              active: true,
              discoveryPathSegments: ["integrations", "gmail", "gmail-triage"],
            },
            {
              id: "wf.sales",
              name: "Sales follow-up",
              active: false,
              discoveryPathSegments: ["sales", "sales-follow-up"],
            },
          ],
        } as Response;
      }
      if (url.startsWith(ApiPaths.telemetryDashboardSummary())) {
        return {
          ok: true,
          json: async () => ({
            runs: {
              totalRuns: 12,
              completedRuns: 10,
              failedRuns: 2,
              runningRuns: 0,
              averageDurationMs: 180000,
            },
            ai: {
              inputTokens: 1200,
              outputTokens: 640,
              totalTokens: 1840,
              cachedInputTokens: 180,
              reasoningTokens: 55,
            },
          }),
        } as Response;
      }
      if (url.startsWith(ApiPaths.telemetryDashboardTimeseries())) {
        return {
          ok: true,
          json: async () => ({
            interval: "day",
            buckets: [
              {
                bucketStartIso: "2026-04-01T00:00:00.000Z",
                bucketEndIso: "2026-04-02T00:00:00.000Z",
                totalRuns: 4,
                completedRuns: 3,
                failedRuns: 1,
                runningRuns: 0,
                averageDurationMs: 120000,
                inputTokens: 300,
                outputTokens: 180,
                totalTokens: 480,
                cachedInputTokens: 40,
                reasoningTokens: 8,
              },
              {
                bucketStartIso: "2026-04-02T00:00:00.000Z",
                bucketEndIso: "2026-04-03T00:00:00.000Z",
                totalRuns: 8,
                completedRuns: 7,
                failedRuns: 1,
                runningRuns: 0,
                averageDurationMs: 240000,
                inputTokens: 900,
                outputTokens: 460,
                totalTokens: 1360,
                cachedInputTokens: 140,
                reasoningTokens: 47,
              },
            ],
          }),
        } as Response;
      }
      if (url.startsWith(ApiPaths.telemetryDashboardDimensions())) {
        return {
          ok: true,
          json: async () => ({
            modelNames: ["gpt-4.1-mini", "gpt-4o-mini"],
          }),
        } as Response;
      }
      return {
        ok: false,
        text: async () => `Unhandled URL: ${url}`,
      } as Response;
    });
    priorFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    priorResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.fetch = priorFetch;
    if (priorResizeObserver) {
      globalThis.ResizeObserver = priorResizeObserver;
    } else {
      delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    }
  });

  function renderScreen() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardScreen />
      </QueryClientProvider>,
    );
  }

  it("renders telemetry headline cards and charts", async () => {
    renderScreen();

    expect(await screen.findByTestId("dashboard-screen")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-metric-total-runs")).toHaveTextContent("12");
    });
    expect(screen.getByTestId("dashboard-metric-total-tokens")).toHaveTextContent("1,840");
    expect(screen.getByTestId("dashboard-run-status-chart")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-token-chart")).toBeInTheDocument();
  });

  it("renders custom range inputs and forwards their changes", () => {
    const handleCustomStartChange = vi.fn();
    const handleCustomEndChange = vi.fn();

    render(
      <DashboardFilterCard
        timePreset="custom"
        onTimePresetChange={vi.fn()}
        customStart=""
        customEnd=""
        onCustomStartChange={handleCustomStartChange}
        onCustomEndChange={handleCustomEndChange}
        workflowOptions={[]}
        selectedWorkflowIds={[]}
        onToggleWorkflowId={vi.fn()}
        folderOptions={[]}
        selectedFolders={[]}
        onToggleFolder={vi.fn()}
        selectedStatuses={[]}
        onToggleStatus={vi.fn()}
        modelOptions={[]}
        selectedModelNames={[]}
        onToggleModelName={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("dashboard-custom-start"), { target: { value: "2026-04-14T09:00" } });
    fireEvent.change(screen.getByTestId("dashboard-custom-end"), { target: { value: "2026-04-14T10:00" } });

    expect(handleCustomStartChange).toHaveBeenCalledWith("2026-04-14T09:00");
    expect(handleCustomEndChange).toHaveBeenCalledWith("2026-04-14T10:00");
  });
});
