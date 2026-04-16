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
          modelNames: ["gpt-4.1-mini"],
          startTimeGte: "2026-04-03T00:00:00.000Z",
          endTimeLte: "2026-04-04T00:00:00.000Z",
        },
      }),
    ).resolves.toEqual({
      interval: "day",
      buckets: [],
    });
    await expect(TelemetryDashboardApi.fetchDimensions({})).resolves.toEqual({
      modelNames: ["gpt-4o-mini"],
    });

    expect(requests).toEqual([
      "/api/telemetry/dashboard/summary?workflowId=wf-a&workflowId=wf-b&status=completed&modelName=gpt-4o-mini&startTimeGte=2026-04-01T00%3A00%3A00.000Z&endTimeLte=2026-04-02T00%3A00%3A00.000Z",
      "/api/telemetry/dashboard/timeseries?workflowId=wf-a&status=failed&modelName=gpt-4.1-mini&startTimeGte=2026-04-03T00%3A00%3A00.000Z&endTimeLte=2026-04-04T00%3A00%3A00.000Z&interval=day",
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

  it("builds preset and custom telemetry ranges", () => {
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
          customEnd: "2026-04-20T00:00:00.000Z",
        },
        new Date("2026-04-14T10:00:00.000Z"),
      )?.interval,
    ).toBe("day");
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

    expect(screen.getByTestId("dashboard-models")).toHaveTextContent("Models: 2 selected");
    expect(screen.getByTestId("dashboard-folders")).toHaveTextContent("Folders: All");
  });
});
