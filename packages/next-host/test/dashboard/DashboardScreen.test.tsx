// @vitest-environment jsdom

import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardFilterCard } from "../../src/features/dashboard/components/DashboardFilterCard";
import { DashboardScreen } from "../../src/features/dashboard/screens/DashboardScreen";
import { TelemetryDashboardTimeRangeFactory } from "../../src/features/dashboard/lib/TelemetryDashboardTimeRangeFactory";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe("DashboardScreen", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let priorFetch: typeof globalThis.fetch;
  let priorResizeObserver: typeof globalThis.ResizeObserver | undefined;
  let priorHasPointerCapture: typeof HTMLElement.prototype.hasPointerCapture | undefined;
  let priorSetPointerCapture: typeof HTMLElement.prototype.setPointerCapture | undefined;
  let priorReleasePointerCapture: typeof HTMLElement.prototype.releasePointerCapture | undefined;
  let summaryErrorText: string | null;

  beforeEach(() => {
    summaryErrorText = null;
    window.localStorage.clear();
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
        if (summaryErrorText) {
          return {
            ok: false,
            text: async () => summaryErrorText ?? "Unknown summary error",
          } as Response;
        }
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
            costs: {
              currencies: [
                {
                  currency: "USD",
                  currencyScale: 1_000_000_000,
                  estimatedCostMinor: 612_000,
                  averageCostPerRunMinor: 51_000,
                  costKeys: [
                    { costKey: "gpt-4o-mini", estimatedCostMinor: 402_000 },
                    { costKey: "prebuilt_read", estimatedCostMinor: 210_000 },
                  ],
                },
              ],
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
                costs: [
                  {
                    currency: "USD",
                    currencyScale: 1_000_000_000,
                    estimatedCostMinor: 120_000,
                    component: "chat",
                    costKey: "gpt-4o-mini",
                  },
                  {
                    currency: "USD",
                    currencyScale: 1_000_000_000,
                    estimatedCostMinor: 60_000,
                    component: "ocr",
                    costKey: "prebuilt_read",
                  },
                ],
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
                costs: [
                  {
                    currency: "USD",
                    currencyScale: 1_000_000_000,
                    estimatedCostMinor: 432_000,
                    component: "ocr",
                    costKey: "prebuilt_read",
                  },
                ],
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
      if (url.startsWith(ApiPaths.telemetryDashboardRuns())) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                runId: "run-1",
                workflowId: "wf.gmail",
                status: "failed",
                origin: "triggered",
                startedAt: "2026-04-14T10:00:00.000Z",
                finishedAt: "2026-04-14T10:02:00.000Z",
                costs: [{ currency: "USD", currencyScale: 1_000_000_000, estimatedCostMinor: 55_000 }],
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 10,
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
    priorHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
    priorSetPointerCapture = HTMLElement.prototype.setPointerCapture;
    priorReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });

  afterEach(() => {
    window.localStorage.clear();
    globalThis.fetch = priorFetch;
    if (priorResizeObserver) {
      globalThis.ResizeObserver = priorResizeObserver;
    } else {
      delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    }
    if (priorHasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = priorHasPointerCapture;
    } else {
      delete (HTMLElement.prototype as { hasPointerCapture?: typeof HTMLElement.prototype.hasPointerCapture })
        .hasPointerCapture;
    }
    if (priorSetPointerCapture) {
      HTMLElement.prototype.setPointerCapture = priorSetPointerCapture;
    } else {
      delete (HTMLElement.prototype as { setPointerCapture?: typeof HTMLElement.prototype.setPointerCapture })
        .setPointerCapture;
    }
    if (priorReleasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = priorReleasePointerCapture;
    } else {
      delete (
        HTMLElement.prototype as {
          releasePointerCapture?: typeof HTMLElement.prototype.releasePointerCapture;
        }
      ).releasePointerCapture;
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
    expect(screen.getByTestId("dashboard-cost-summary-card")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-cost-chart")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-cost-currency-USD")).toHaveTextContent("$0.000612");
    expect(screen.getByTestId("dashboard-cost-key-USD-gpt-4o-mini")).toHaveTextContent("gpt-4o-mini");
    expect(screen.getByTestId("dashboard-cost-key-USD-prebuilt_read")).toHaveTextContent("prebuilt_read");
    expect(screen.getByTestId("dashboard-workflow-runs-table")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-run-row-run-1")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-run-link-run-1")).toHaveTextContent("Gmail triage");
    expect(screen.getByTestId("dashboard-run-total-cost-run-1")).toHaveTextContent("$0.000055");
  });

  it("shows a destructive alert when the dashboard query fails", async () => {
    summaryErrorText = "summary request failed";

    renderScreen();

    expect(await screen.findByTestId("dashboard-load-error")).toHaveTextContent("summary request failed");
  });

  it("renders legacy cost component summaries without crashing", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
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
          ],
        } as Response;
      }
      if (url.startsWith(ApiPaths.telemetryDashboardSummary())) {
        return {
          ok: true,
          json: async () => ({
            runs: {
              totalRuns: 1,
              completedRuns: 1,
              failedRuns: 0,
              runningRuns: 0,
              averageDurationMs: 1000,
            },
            ai: {
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
              cachedInputTokens: 0,
              reasoningTokens: 0,
            },
            costs: {
              currencies: [
                {
                  currency: "USD",
                  currencyScale: 1_000_000_000,
                  estimatedCostMinor: 1_200,
                  averageCostPerRunMinor: 1_200,
                  components: [{ component: "chat", estimatedCostMinor: 1_200 }],
                },
              ],
            },
          }),
        } as Response;
      }
      if (url.startsWith(ApiPaths.telemetryDashboardTimeseries())) {
        return { ok: true, json: async () => ({ interval: "day", buckets: [] }) } as Response;
      }
      if (url.startsWith(ApiPaths.telemetryDashboardDimensions())) {
        return { ok: true, json: async () => ({ modelNames: [] }) } as Response;
      }
      if (url.startsWith(ApiPaths.telemetryDashboardRuns())) {
        return { ok: true, json: async () => ({ items: [], totalCount: 0, page: 1, pageSize: 10 }) } as Response;
      }
      return { ok: false, text: async () => `Unhandled URL: ${url}` } as Response;
    });

    renderScreen();

    expect(await screen.findByTestId("dashboard-cost-summary-card")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-cost-currency-USD")).toHaveTextContent("$0.0000012");
    });
  });

  it("shows the invalid custom range alert when custom mode is selected without both timestamps", async () => {
    const priorCreateRange = TelemetryDashboardTimeRangeFactory.createRange;
    TelemetryDashboardTimeRangeFactory.createRange = () => null;
    try {
      renderScreen();

      await expect(screen.findByTestId("dashboard-invalid-range")).resolves.toHaveTextContent(
        "Custom range incomplete",
      );
    } finally {
      TelemetryDashboardTimeRangeFactory.createRange = priorCreateRange;
    }
  });

  it("restores persisted filters from local storage", async () => {
    window.localStorage.setItem(
      "codemation.telemetry.dashboard.filters.v1",
      JSON.stringify({
        timePreset: "last_hour",
        customStart: "",
        customEnd: "",
        selectedWorkflowIds: [],
        selectedFolders: [],
        selectedStatuses: [],
        selectedRunOrigins: ["manual"],
        selectedModelNames: [],
      }),
    );

    renderScreen();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.toString()));
    expect(requestedUrls.some((url) => url.includes("runOrigin=manual"))).toBe(true);
  });

  it("renders custom range inputs and forwards their changes", () => {
    const handleCustomStartChange = vi.fn();
    const handleCustomEndChange = vi.fn();
    const handleToggleStatus = vi.fn();
    const handleToggleRunOrigin = vi.fn();

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
        onClearWorkflowIds={vi.fn()}
        folderOptions={[]}
        selectedFolders={[]}
        onToggleFolder={vi.fn()}
        onClearFolders={vi.fn()}
        selectedStatuses={[]}
        onToggleStatus={handleToggleStatus}
        selectedRunOrigins={["triggered"]}
        onToggleRunOrigin={handleToggleRunOrigin}
        modelOptions={[]}
        selectedModelNames={[]}
        onToggleModelName={vi.fn()}
        onClearModelNames={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("dashboard-custom-start"), { target: { value: "2026-04-14T09:00" } });
    fireEvent.change(screen.getByTestId("dashboard-custom-end"), { target: { value: "2026-04-14T10:00" } });
    fireEvent.click(screen.getByTestId("dashboard-status-pill-failed"));
    fireEvent.click(screen.getByTestId("dashboard-run-origin-pill-manual"));

    expect(handleCustomStartChange).toHaveBeenCalledWith("2026-04-14T09:00");
    expect(handleCustomEndChange).toHaveBeenCalledWith("2026-04-14T10:00");
    expect(handleToggleStatus).toHaveBeenCalledWith("failed");
    expect(handleToggleRunOrigin).toHaveBeenCalledWith("manual");
  });
});
