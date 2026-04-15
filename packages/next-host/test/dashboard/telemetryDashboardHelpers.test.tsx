// @vitest-environment jsdom

import type { TelemetryDashboardTimeseriesDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WorkflowSummary } from "../../src/features/workflows/hooks/realtime/realtime";
import { DashboardMetricGrid } from "../../src/features/dashboard/components/DashboardMetricGrid";
import { DashboardRunStatusChart } from "../../src/features/dashboard/components/DashboardRunStatusChart";
import { DashboardTokenChart } from "../../src/features/dashboard/components/DashboardTokenChart";
import { TelemetryDashboardFolderResolver } from "../../src/features/dashboard/lib/TelemetryDashboardFolderResolver";
import { TelemetryDashboardTimeRangeFactory } from "../../src/features/dashboard/lib/TelemetryDashboardTimeRangeFactory";

function workflowSummary(id: string, name: string, discoveryPathSegments: ReadonlyArray<string>): WorkflowSummary {
  return { id, name, active: true, discoveryPathSegments };
}

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
});
