// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardMetricCard } from "../../src/features/dashboard/components/DashboardMetricCard";
import { DashboardWorkflowRunsTable } from "../../src/features/dashboard/components/DashboardWorkflowRunsTable";
import { DashboardCostAmountFormatter } from "../../src/features/dashboard/lib/DashboardCostAmountFormatter";
import { DashboardDateTimeFormatter } from "../../src/features/dashboard/lib/DashboardDateTimeFormatter";
import { DashboardFilterStorage } from "../../src/features/dashboard/lib/DashboardFilterStorage";

// ─── DashboardMetricCard ──────────────────────────────────────────────────────

describe("DashboardMetricCard", () => {
  it("renders title, value, and testId", () => {
    render(<DashboardMetricCard title="Total runs" value="42" testId="metric-total-runs" />);
    const card = screen.getByTestId("metric-total-runs");
    expect(card).toHaveTextContent("Total runs");
    expect(card).toHaveTextContent("42");
  });

  it("renders an optional description", () => {
    render(
      <DashboardMetricCard title="Success rate" value="95%" description="Last 30 days" testId="metric-success-rate" />,
    );
    expect(screen.getByTestId("metric-success-rate")).toHaveTextContent("Last 30 days");
  });

  it("renders without description when not provided", () => {
    const { container } = render(<DashboardMetricCard title="Tokens" value="1,200" testId="metric-tokens" />);
    // No CardContent element (description area) rendered
    expect(container.querySelectorAll("[data-testid]")).toHaveLength(1);
  });

  it("renders optional badge content", () => {
    render(
      <DashboardMetricCard
        title="Errors"
        value="3"
        badge={<span data-testid="error-badge">!</span>}
        testId="metric-errors"
      />,
    );
    expect(screen.getByTestId("error-badge")).toBeInTheDocument();
  });
});

// ─── DashboardWorkflowRunsTable ───────────────────────────────────────────────

function makeRunsDto(overrides: {
  items?: ReadonlyArray<{
    runId: string;
    workflowId: string;
    status: string;
    origin: string;
    startedAt: string;
    finishedAt?: string;
    costs?: ReadonlyArray<{ currency: string; currencyScale: number; estimatedCostMinor: number }>;
  }>;
  totalCount?: number;
  page?: number;
  pageSize?: number;
}) {
  return {
    items: overrides.items ?? [],
    totalCount: overrides.totalCount ?? 0,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 10,
  };
}

describe("DashboardWorkflowRunsTable", () => {
  it("shows loading row when runs is undefined", () => {
    render(<DashboardWorkflowRunsTable runs={undefined} workflowNamesById={{}} onPageChange={() => {}} />);
    expect(screen.getByText("Loading workflow runs…")).toBeInTheDocument();
  });

  it("shows empty state when runs has no items", () => {
    render(<DashboardWorkflowRunsTable runs={makeRunsDto({})} workflowNamesById={{}} onPageChange={() => {}} />);
    expect(screen.getByText("No workflow runs match the current filters.")).toBeInTheDocument();
  });

  it("renders a row per run and resolves workflow name", () => {
    const runs = makeRunsDto({
      items: [
        {
          runId: "run-abc",
          workflowId: "wf.gmail",
          status: "completed",
          origin: "triggered",
          startedAt: "2026-04-14T10:00:00.000Z",
          finishedAt: "2026-04-14T10:01:00.000Z",
        },
      ],
      totalCount: 1,
    });
    render(
      <DashboardWorkflowRunsTable
        runs={runs}
        workflowNamesById={{ "wf.gmail": "Gmail triage" }}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByTestId("dashboard-run-row-run-abc")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-run-link-run-abc")).toHaveTextContent("Gmail triage");
  });

  it("falls back to workflowId when name lookup misses", () => {
    const runs = makeRunsDto({
      items: [
        {
          runId: "run-xyz",
          workflowId: "wf.unknown",
          status: "failed",
          origin: "manual",
          startedAt: "2026-04-14T10:00:00.000Z",
        },
      ],
      totalCount: 1,
    });
    render(<DashboardWorkflowRunsTable runs={runs} workflowNamesById={{}} onPageChange={() => {}} />);
    expect(screen.getByTestId("dashboard-run-link-run-xyz")).toHaveTextContent("wf.unknown");
  });

  it("shows pagination summary and prev/next buttons", () => {
    const runs = makeRunsDto({ items: [], totalCount: 25, page: 2, pageSize: 10 });
    let changedPage: number | null = null;
    render(
      <DashboardWorkflowRunsTable
        runs={runs}
        workflowNamesById={{}}
        onPageChange={(p) => {
          changedPage = p;
        }}
      />,
    );
    // Page 2 of 3 — previous should be enabled, next enabled
    expect(screen.getByTestId("dashboard-runs-page-indicator")).toHaveTextContent("Page 2 of 3");

    fireEvent.click(screen.getByTestId("dashboard-runs-previous-page"));
    expect(changedPage).toBe(1);

    fireEvent.click(screen.getByTestId("dashboard-runs-next-page"));
    expect(changedPage).toBe(3);
  });

  it("disables previous on page 1 and next on last page", () => {
    const singlePageRuns = makeRunsDto({ items: [], totalCount: 5, page: 1, pageSize: 10 });
    render(<DashboardWorkflowRunsTable runs={singlePageRuns} workflowNamesById={{}} onPageChange={() => {}} />);
    expect(screen.getByTestId("dashboard-runs-previous-page")).toBeDisabled();
    expect(screen.getByTestId("dashboard-runs-next-page")).toBeDisabled();
  });

  it("shows '0 results' in pagination summary when totalCount is 0", () => {
    render(<DashboardWorkflowRunsTable runs={makeRunsDto({})} workflowNamesById={{}} onPageChange={() => {}} />);
    expect(screen.getByTestId("dashboard-runs-pagination-summary")).toHaveTextContent("0 results");
  });
});

// ─── DashboardCostAmountFormatter ────────────────────────────────────────────

describe("DashboardCostAmountFormatter", () => {
  it("normalizes amount correctly", () => {
    expect(DashboardCostAmountFormatter.normalizeAmount({ amountMinor: 1_000_000, currencyScale: 1_000_000_000 })).toBe(
      0.001,
    );
    expect(DashboardCostAmountFormatter.normalizeAmount({ amountMinor: 500, currencyScale: 0 })).toBe(500);
  });

  it("formats a single currency total", () => {
    const result = DashboardCostAmountFormatter.format({
      currency: "USD",
      amountMinor: 612_000,
      currencyScale: 1_000_000_000,
    });
    expect(result).toContain("$");
    expect(result).toContain("0.000612");
  });

  it("returns '—' when totals is empty or undefined", () => {
    expect(DashboardCostAmountFormatter.formatTotals([])).toBe("—");
    expect(DashboardCostAmountFormatter.formatTotals(undefined)).toBe("—");
  });

  it("sums multiple totals of the same currency", () => {
    const result = DashboardCostAmountFormatter.formatTotals([
      { currency: "USD", currencyScale: 1_000_000_000, estimatedCostMinor: 400_000 },
      { currency: "USD", currencyScale: 1_000_000_000, estimatedCostMinor: 200_000 },
    ]);
    // 600_000 / 1_000_000_000 = 0.0000006 = $0.00000060 in USD
    expect(result).toContain("$");
    // Should be a single currency total (not two separate lines)
    expect(result).not.toContain(" · ");
  });
});

// ─── DashboardDateTimeFormatter ──────────────────────────────────────────────

describe("DashboardDateTimeFormatter", () => {
  it("formats bucket label as time for sub-hour intervals", () => {
    const label = DashboardDateTimeFormatter.formatBucketLabel("minute_5", "2026-04-14T10:30:00.000Z");
    expect(label).toContain("UTC");
  });

  it("formats bucket label as date for day interval", () => {
    const label = DashboardDateTimeFormatter.formatBucketLabel("day", "2026-04-14T00:00:00.000Z");
    // Should not contain UTC for day-level labels
    expect(label).not.toContain("UTC");
  });

  it("formats timestamp correctly", () => {
    const ts = DashboardDateTimeFormatter.formatTimestamp("2026-04-14T10:30:00.000Z");
    expect(ts).toContain("UTC");
    expect(ts).toContain("2026");
  });

  it("returns 'In progress' for undefined finishedAt", () => {
    expect(DashboardDateTimeFormatter.formatDuration("2026-04-14T10:00:00.000Z", undefined)).toBe("In progress");
  });

  it("formats known duration", () => {
    const result = DashboardDateTimeFormatter.formatDuration("2026-04-14T10:00:00.000Z", "2026-04-14T10:02:00.000Z");
    expect(result).toBe("2m");
  });

  it("returns 'Unknown' for invalid duration", () => {
    expect(DashboardDateTimeFormatter.formatDuration("bad", "also-bad")).toBe("Unknown");
  });

  it("returns 'Unknown' for negative duration", () => {
    expect(DashboardDateTimeFormatter.formatDuration("2026-04-14T10:02:00.000Z", "2026-04-14T10:00:00.000Z")).toBe(
      "Unknown",
    );
  });
});

// ─── DashboardFilterStorage ───────────────────────────────────────────────────

describe("DashboardFilterStorage", () => {
  it("returns null when localStorage is empty", () => {
    window.localStorage.clear();
    expect(DashboardFilterStorage.load()).toBeNull();
  });

  it("saves and loads filters from localStorage", () => {
    window.localStorage.clear();
    const filters = {
      timePreset: "today" as const,
      customStart: "",
      customEnd: "",
      selectedWorkflowIds: ["wf.gmail"],
      selectedFolders: [],
      selectedStatuses: [],
      selectedRunOrigins: ["triggered" as const],
      selectedModelNames: ["gpt-4o-mini"],
    };
    DashboardFilterStorage.save(filters);
    const loaded = DashboardFilterStorage.load();
    expect(loaded).toMatchObject({ timePreset: "today", selectedWorkflowIds: ["wf.gmail"] });
    window.localStorage.clear();
  });

  it("returns null when stored JSON is invalid", () => {
    window.localStorage.setItem("codemation.telemetry.dashboard.filters.v1", "{bad json");
    expect(DashboardFilterStorage.load()).toBeNull();
    window.localStorage.clear();
  });

  it("returns null when stored object has no timePreset", () => {
    window.localStorage.setItem("codemation.telemetry.dashboard.filters.v1", JSON.stringify({ customStart: "" }));
    expect(DashboardFilterStorage.load()).toBeNull();
    window.localStorage.clear();
  });
});
