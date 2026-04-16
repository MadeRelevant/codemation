// @vitest-environment jsdom

import type { TelemetryDashboardTimeseriesDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardMultiSelect } from "../../src/features/dashboard/components/DashboardMultiSelect";
import type { WorkflowSummary } from "../../src/features/workflows/hooks/realtime/realtime";
import { DashboardMetricGrid } from "../../src/features/dashboard/components/DashboardMetricGrid";
import { DashboardRunStatusChart } from "../../src/features/dashboard/components/DashboardRunStatusChart";
import { DashboardTokenChart } from "../../src/features/dashboard/components/DashboardTokenChart";
import { DashboardWorkflowOptionsBuilder } from "../../src/features/dashboard/lib/DashboardWorkflowOptionsBuilder";
import { TelemetryDashboardFolderResolver } from "../../src/features/dashboard/lib/TelemetryDashboardFolderResolver";
import { TelemetryDashboardApi } from "../../src/features/dashboard/lib/telemetryDashboardApi";
import { TelemetryDashboardTimeRangeFactory } from "../../src/features/dashboard/lib/TelemetryDashboardTimeRangeFactory";

function workflowSummary(id: string, name: string, discoveryPathSegments: ReadonlyArray<string>): WorkflowSummary {
  return { id, name, active: true, discoveryPathSegments };
}

describe("telemetry dashboard api", () => {
  const priorFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = priorFetch;
  });

  it("serializes summary, timeseries, and dimensions filters into the api query string", async () => {
    const requests: Array<string> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requests.push(url);
      return {
        ok: true,
        json: async () =>
          url.startsWith(ApiPaths.telemetryDashboardDimensions())
            ? { modelNames: ["gpt-4o-mini"] }
            : url.startsWith(ApiPaths.telemetryDashboardRuns())
              ? { items: [], totalCount: 0, page: 2, pageSize: 5 }
              : url.startsWith(ApiPaths.telemetryDashboardTimeseries())
                ? { interval: "day", buckets: [] }
                : {
                    runs: {
                      totalRuns: 1,
                      completedRuns: 1,
                      failedRuns: 0,
                      runningRuns: 0,
                      averageDurationMs: 1000,
                    },
                    ai: {
                      inputTokens: 4,
                      outputTokens: 2,
                      totalTokens: 6,
                      cachedInputTokens: 1,
                      reasoningTokens: 0,
                    },
                  },
      } as Response;
    }) as typeof fetch;

    await expect(
      TelemetryDashboardApi.fetchSummary({
        workflowIds: ["wf-a", "wf-b"],
        statuses: ["completed"],
        runOrigins: ["triggered"],
        modelNames: ["gpt-4o-mini"],
        startTimeGte: "2026-04-01T00:00:00.000Z",
        endTimeLte: "2026-04-02T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      runs: { totalRuns: 1 },
      ai: { totalTokens: 6 },
    });
    await expect(
      TelemetryDashboardApi.fetchTimeseries({
        interval: "day",
        filters: {
          workflowIds: ["wf-a"],
          statuses: ["failed"],
          runOrigins: ["manual"],
          modelNames: ["gpt-4.1-mini"],
          startTimeGte: "2026-04-03T00:00:00.000Z",
          endTimeLte: "2026-04-04T00:00:00.000Z",
        },
      }),
    ).resolves.toEqual({
      interval: "day",
      buckets: [],
    });
    await expect(
      TelemetryDashboardApi.fetchRuns({
        filters: {
          workflowIds: ["wf-a"],
          statuses: ["failed"],
          runOrigins: ["triggered"],
        },
        page: 2,
        pageSize: 5,
      }),
    ).resolves.toEqual({
      items: [],
      totalCount: 0,
      page: 2,
      pageSize: 5,
    });
    await expect(TelemetryDashboardApi.fetchDimensions({})).resolves.toEqual({
      modelNames: ["gpt-4o-mini"],
    });

    expect(requests).toEqual([
      "/api/telemetry/dashboard/summary?workflowId=wf-a&workflowId=wf-b&status=completed&runOrigin=triggered&modelName=gpt-4o-mini&startTimeGte=2026-04-01T00%3A00%3A00.000Z&endTimeLte=2026-04-02T00%3A00%3A00.000Z",
      "/api/telemetry/dashboard/timeseries?workflowId=wf-a&status=failed&runOrigin=manual&modelName=gpt-4.1-mini&startTimeGte=2026-04-03T00%3A00%3A00.000Z&endTimeLte=2026-04-04T00%3A00%3A00.000Z&interval=day",
      "/api/telemetry/dashboard/runs?workflowId=wf-a&status=failed&runOrigin=triggered&page=2&pageSize=5",
      "/api/telemetry/dashboard/dimensions",
    ]);
  });
});

describe("dashboard helpers", () => {
  it("resolves folders and workflow ids from selected folders", () => {
    const workflows = [
      workflowSummary("wf.gmail", "Gmail", ["integrations", "gmail", "gmail"]),
      workflowSummary("wf.sales", "Sales", ["sales", "sales"]),
    ];

    expect(TelemetryDashboardFolderResolver.listFolders(workflows)).toEqual(["integrations/gmail", "sales"]);
    expect(
      TelemetryDashboardFolderResolver.resolveWorkflowIds(workflows, ["wf.sales"], ["integrations/gmail"]),
    ).toEqual(["wf.gmail", "wf.sales"]);
    expect(TelemetryDashboardFolderResolver.listFolders([workflowSummary("wf.root", "Root", ["root"])])).toEqual([]);
  });

  it("builds nested workflow options from the folder tree", () => {
    const workflows = [
      workflowSummary("wf.root", "Root workflow", []),
      workflowSummary("wf.gmail", "Gmail triage", ["integrations", "gmail", "gmail-triage"]),
      workflowSummary("wf.sales", "Sales follow-up", ["sales", "sales-follow-up"]),
    ];

    expect(DashboardWorkflowOptionsBuilder.buildOptions(workflows)).toEqual([
      { kind: "option", value: "wf.root", label: "Root workflow", depth: 0 },
      { kind: "heading", label: "integrations", depth: 0 },
      { kind: "heading", label: "gmail", depth: 1 },
      { kind: "option", value: "wf.gmail", label: "Gmail triage", depth: 2 },
      { kind: "heading", label: "sales", depth: 0 },
      { kind: "option", value: "wf.sales", label: "Sales follow-up", depth: 1 },
    ]);
  });

  it("builds preset and custom telemetry ranges", () => {
    expect(
      TelemetryDashboardTimeRangeFactory.createRange(
        { preset: "last_15_minutes" },
        new Date("2026-04-14T10:00:00.000Z"),
      )?.interval,
    ).toBe("minute_5");

    const todayRange = TelemetryDashboardTimeRangeFactory.createRange(
      { preset: "today" },
      new Date("2026-04-14T10:00:00.000Z"),
    );
    expect(todayRange?.interval).toBe("hour");
    expect(new Date(todayRange!.startTimeGte).getTime()).toBeLessThan(new Date(todayRange!.endTimeLte).getTime());

    expect(
      TelemetryDashboardTimeRangeFactory.createRange({
        preset: "custom",
        customStart: "2026-04-01T00:00:00.000Z",
        customEnd: "2026-06-30T00:00:00.000Z",
      }),
    ).toMatchObject({
      interval: "week",
    });

    expect(
      TelemetryDashboardTimeRangeFactory.createRequest({ preset: "custom", customStart: "", customEnd: "" }, {}),
    ).toBeNull();
    expect(
      TelemetryDashboardTimeRangeFactory.createRange({ preset: "yesterday" }, new Date("2026-04-14T10:00:00.000Z"))
        ?.interval,
    ).toBe("hour");
    expect(
      TelemetryDashboardTimeRangeFactory.createRange(
        {
          preset: "custom",
          customStart: "2026-04-01T00:00:00.000Z",
          customEnd: "2026-04-01T01:30:00.000Z",
        },
        new Date("2026-04-14T10:00:00.000Z"),
      )?.interval,
    ).toBe("minute_5");
    expect(
      TelemetryDashboardTimeRangeFactory.createRange({
        preset: "custom",
        customStart: "2026-04-20T00:00:00.000Z",
        customEnd: "2026-04-01T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      TelemetryDashboardTimeRangeFactory.createRequest(
        {
          preset: "this_year",
        },
        {
          workflowIds: ["wf-a"],
          statuses: ["completed"],
          modelNames: ["gpt-4o-mini"],
        },
        new Date("2026-08-14T10:00:00.000Z"),
      ),
    ).toMatchObject({
      interval: "week",
      filters: {
        workflowIds: ["wf-a"],
        statuses: ["completed"],
        modelNames: ["gpt-4o-mini"],
      },
    });
  });

  it("renders metrics and token chart modes", () => {
    const series = {
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
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cachedInputTokens: 20,
          reasoningTokens: 5,
        },
      ],
    } satisfies TelemetryDashboardTimeseriesDto;
    render(
      <>
        <DashboardMetricGrid
          summary={{
            runs: {
              totalRuns: 4,
              completedRuns: 3,
              failedRuns: 1,
              runningRuns: 0,
              averageDurationMs: 120000,
            },
            ai: {
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              cachedInputTokens: 20,
              reasoningTokens: 5,
            },
          }}
        />
        <DashboardRunStatusChart series={series} />
        <DashboardTokenChart series={series} />
      </>,
    );

    expect(screen.getByTestId("dashboard-metric-total-runs")).toHaveTextContent("4");
    expect(screen.getByTestId("dashboard-metric-total-tokens")).toHaveTextContent("150");
    expect(screen.getByTestId("dashboard-run-status-chart")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("dashboard-token-chart-breakdown"));
    expect(screen.getByTestId("dashboard-token-chart")).toBeInTheDocument();
  });

  it("renders multiselect summaries for all and selected states", () => {
    render(
      <>
        <DashboardMultiSelect
          label="Models"
          options={[
            { value: "gpt-4o-mini", label: "GPT-4o mini" },
            { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
          ]}
          selectedValues={["gpt-4o-mini", "gpt-4.1-mini"]}
          onToggleValue={vi.fn()}
          onClearSelection={vi.fn()}
          testId="dashboard-models"
        />
        <DashboardMultiSelect
          label="Folders"
          options={[]}
          selectedValues={[]}
          onToggleValue={vi.fn()}
          emptyLabel="No folders available"
          testId="dashboard-folders"
        />
      </>,
    );

    expect(screen.getByTestId("dashboard-models")).toHaveTextContent("2 selected");
    expect(screen.getByTestId("dashboard-folders")).toHaveTextContent("All");
  });

  it("shows a clear selection action only when values are selected", () => {
    const handleClearSelection = vi.fn();
    render(
      <>
        <DashboardMultiSelect
          label="Workflows"
          options={[{ value: "wf-1", label: "Workflow one" }]}
          selectedValues={["wf-1"]}
          onToggleValue={vi.fn()}
          onClearSelection={handleClearSelection}
          testId="dashboard-workflows"
          defaultOpen
        />
        <DashboardMultiSelect
          label="Folders"
          options={[{ value: "sales", label: "Sales" }]}
          selectedValues={[]}
          onToggleValue={vi.fn()}
          onClearSelection={vi.fn()}
          testId="dashboard-empty-selection"
          defaultOpen
        />
      </>,
    );

    fireEvent.click(screen.getByTestId("dashboard-workflows-clear"));
    expect(handleClearSelection).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId("dashboard-empty-selection-clear")).not.toBeInTheDocument();
  });
});
