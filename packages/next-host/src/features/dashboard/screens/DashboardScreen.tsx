"use client";

import type {
  TelemetryDashboardFiltersDto,
  TelemetryDashboardRunOriginDto,
} from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { Activity } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DashboardAiUsageSummaryCard } from "../components/DashboardAiUsageSummaryCard";
import { DashboardCostChart } from "../components/DashboardCostChart";
import { DashboardCostSummaryCard } from "../components/DashboardCostSummaryCard";
import { DashboardFilterCard } from "../components/DashboardFilterCard";
import { DashboardRunSummaryCard } from "../components/DashboardRunSummaryCard";
import { DashboardRunStatusChart } from "../components/DashboardRunStatusChart";
import { DashboardTokenChart } from "../components/DashboardTokenChart";
import { DashboardWorkflowRunsTable } from "../components/DashboardWorkflowRunsTable";
import { useDashboardFilterPersistence } from "../hooks/useDashboardFilterPersistence";
import {
  useTelemetryDashboardDimensionsQuery,
  useTelemetryDashboardRunsQuery,
  useTelemetryDashboardSummaryQuery,
  useTelemetryDashboardTimeseriesQuery,
} from "../hooks/useTelemetryDashboard";
import { TelemetryDashboardFolderResolver } from "../lib/TelemetryDashboardFolderResolver";
import {
  TelemetryDashboardTimeRangeFactory,
  type TelemetryDashboardTimePreset,
} from "../lib/TelemetryDashboardTimeRangeFactory";
import { DashboardWorkflowOptionsBuilder } from "../lib/DashboardWorkflowOptionsBuilder";
import { useWorkflowsQuery } from "../../workflows/hooks/realtime/realtime";

export function DashboardScreen() {
  const workflowsQuery = useWorkflowsQuery();
  const workflows = workflowsQuery.data ?? [];
  const [timePreset, setTimePreset] = useState<TelemetryDashboardTimePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<ReadonlyArray<string>>([]);
  const [selectedFolders, setSelectedFolders] = useState<ReadonlyArray<string>>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<ReadonlyArray<"running" | "completed" | "failed">>([]);
  const [selectedRunOrigins, setSelectedRunOrigins] = useState<ReadonlyArray<TelemetryDashboardRunOriginDto>>([
    "triggered",
  ]);
  const [selectedModelNames, setSelectedModelNames] = useState<ReadonlyArray<string>>([]);
  const [runsPage, setRunsPage] = useState(1);
  const [hasLoadedStoredFilters, setHasLoadedStoredFilters] = useState(false);

  const folderOptions = useMemo(
    () => TelemetryDashboardFolderResolver.listFolders(workflows).map((folder) => ({ value: folder, label: folder })),
    [workflows],
  );
  const workflowOptions = useMemo(() => DashboardWorkflowOptionsBuilder.buildOptions(workflows), [workflows]);
  const workflowNamesById = useMemo(
    () =>
      Object.fromEntries(workflows.map((workflow) => [workflow.id, workflow.name])) as Readonly<Record<string, string>>,
    [workflows],
  );
  const resolvedWorkflowIds = useMemo(
    () => TelemetryDashboardFolderResolver.resolveWorkflowIds(workflows, selectedWorkflowIds, selectedFolders),
    [selectedFolders, selectedWorkflowIds, workflows],
  );
  const range = useMemo(
    () =>
      TelemetryDashboardTimeRangeFactory.createRange({
        preset: timePreset,
        customStart,
        customEnd,
      }),
    [customEnd, customStart, timePreset],
  );
  const filters = useMemo<TelemetryDashboardFiltersDto>(
    () => ({
      workflowIds: resolvedWorkflowIds,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      runOrigins: selectedRunOrigins.length > 0 ? selectedRunOrigins : undefined,
      modelNames: selectedModelNames.length > 0 ? selectedModelNames : undefined,
      startTimeGte: range?.startTimeGte,
      endTimeLte: range?.endTimeLte,
    }),
    [
      range?.endTimeLte,
      range?.startTimeGte,
      resolvedWorkflowIds,
      selectedModelNames,
      selectedRunOrigins,
      selectedStatuses,
    ],
  );
  const dimensionsFilters = useMemo<TelemetryDashboardFiltersDto>(
    () => ({
      workflowIds: resolvedWorkflowIds,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      runOrigins: selectedRunOrigins.length > 0 ? selectedRunOrigins : undefined,
      startTimeGte: range?.startTimeGte,
      endTimeLte: range?.endTimeLte,
    }),
    [range?.endTimeLte, range?.startTimeGte, resolvedWorkflowIds, selectedRunOrigins, selectedStatuses],
  );
  const timeseriesRequest = useMemo(
    () =>
      TelemetryDashboardTimeRangeFactory.createRequest(
        {
          preset: timePreset,
          customStart,
          customEnd,
        },
        {
          workflowIds: resolvedWorkflowIds,
          statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
          runOrigins: selectedRunOrigins.length > 0 ? selectedRunOrigins : undefined,
          modelNames: selectedModelNames.length > 0 ? selectedModelNames : undefined,
        },
      ),
    [customEnd, customStart, resolvedWorkflowIds, selectedModelNames, selectedRunOrigins, selectedStatuses, timePreset],
  );
  const runsRequest = useMemo(
    () => ({
      filters,
      page: runsPage,
      pageSize: 10,
    }),
    [filters, runsPage],
  );
  const queryEnabled = hasLoadedStoredFilters && range !== null;
  const summaryQuery = useTelemetryDashboardSummaryQuery(filters, queryEnabled);
  const timeseriesQuery = useTelemetryDashboardTimeseriesQuery(timeseriesRequest, queryEnabled);
  const dimensionsQuery = useTelemetryDashboardDimensionsQuery(dimensionsFilters, queryEnabled);
  const runsQuery = useTelemetryDashboardRunsQuery(runsRequest, queryEnabled);

  const modelOptions = useMemo(
    () => (dimensionsQuery.data?.modelNames ?? []).map((modelName) => ({ value: modelName, label: modelName })),
    [dimensionsQuery.data?.modelNames],
  );
  const loadError =
    (summaryQuery.error instanceof Error ? summaryQuery.error.message : null) ??
    (timeseriesQuery.error instanceof Error ? timeseriesQuery.error.message : null) ??
    (dimensionsQuery.error instanceof Error ? dimensionsQuery.error.message : null) ??
    (runsQuery.error instanceof Error ? runsQuery.error.message : null) ??
    (workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null);
  const summary = summaryQuery.data;
  const timeseries = timeseriesQuery.data;
  const runs = runsQuery.data;

  useDashboardFilterPersistence({
    current: {
      timePreset,
      customStart,
      customEnd,
      selectedWorkflowIds,
      selectedFolders,
      selectedStatuses,
      selectedRunOrigins,
      selectedModelNames,
    },
    hasLoadedStoredFilters,
    setHasLoadedStoredFilters,
    setTimePreset,
    setCustomStart,
    setCustomEnd,
    setSelectedWorkflowIds,
    setSelectedFolders,
    setSelectedStatuses,
    setSelectedRunOrigins,
    setSelectedModelNames,
  });

  useEffect(() => {
    setRunsPage(1);
  }, [JSON.stringify(filters)]);

  return (
    <main className="w-full px-6 py-6" data-testid="dashboard-screen">
      <div className="grid items-start gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 self-start md:sticky md:top-6">
          <DashboardFilterCard
            timePreset={timePreset}
            onTimePresetChange={setTimePreset}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            workflowOptions={workflowOptions}
            selectedWorkflowIds={selectedWorkflowIds}
            onToggleWorkflowId={(value) =>
              setSelectedWorkflowIds((current) =>
                current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
              )
            }
            onClearWorkflowIds={() => setSelectedWorkflowIds([])}
            folderOptions={folderOptions}
            selectedFolders={selectedFolders}
            onToggleFolder={(value) =>
              setSelectedFolders((current) =>
                current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
              )
            }
            onClearFolders={() => setSelectedFolders([])}
            selectedStatuses={selectedStatuses}
            onToggleStatus={(value) =>
              setSelectedStatuses((current) =>
                current.includes(value as "running" | "completed" | "failed")
                  ? current.filter((entry) => entry !== value)
                  : [...current, value as "running" | "completed" | "failed"],
              )
            }
            selectedRunOrigins={selectedRunOrigins}
            onToggleRunOrigin={(value) =>
              setSelectedRunOrigins((current) =>
                current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
              )
            }
            modelOptions={modelOptions}
            selectedModelNames={selectedModelNames}
            onToggleModelName={(value) =>
              setSelectedModelNames((current) =>
                current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
              )
            }
            onClearModelNames={() => setSelectedModelNames([])}
          />
        </aside>
        <section className="flex min-w-0 flex-col gap-6">
          {range === null ? (
            <Alert data-testid="dashboard-invalid-range">
              <Activity className="size-4" />
              <AlertTitle>Custom range incomplete</AlertTitle>
              <AlertDescription>Pick both a start and end timestamp to query dashboard telemetry.</AlertDescription>
            </Alert>
          ) : null}
          {loadError ? (
            <Alert variant="destructive" data-testid="dashboard-load-error">
              <Activity className="size-4" />
              <AlertTitle>Failed to load dashboard telemetry</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}
          <section className="grid items-stretch gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
            <DashboardRunSummaryCard summary={summary} />
            {timeseries ? <DashboardRunStatusChart series={timeseries} /> : null}
          </section>
          <section className="grid items-stretch gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
            <DashboardAiUsageSummaryCard summary={summary} />
            {timeseries ? <DashboardTokenChart series={timeseries} /> : null}
          </section>
          <section className="grid items-stretch gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
            <DashboardCostSummaryCard summary={summary} />
            {timeseries ? <DashboardCostChart series={timeseries} /> : null}
          </section>
          <DashboardWorkflowRunsTable runs={runs} workflowNamesById={workflowNamesById} onPageChange={setRunsPage} />
        </section>
      </div>
    </main>
  );
}
