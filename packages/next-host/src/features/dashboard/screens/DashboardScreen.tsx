"use client";

import type { TelemetryDashboardFiltersDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { Activity, Sparkles, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DashboardFilterCard } from "../components/DashboardFilterCard";
import { DashboardMetricGrid } from "../components/DashboardMetricGrid";
import { DashboardRunStatusChart } from "../components/DashboardRunStatusChart";
import { DashboardTokenChart } from "../components/DashboardTokenChart";
import {
  useTelemetryDashboardDimensionsQuery,
  useTelemetryDashboardSummaryQuery,
  useTelemetryDashboardTimeseriesQuery,
} from "../hooks/useTelemetryDashboard";
import { TelemetryDashboardFolderResolver } from "../lib/TelemetryDashboardFolderResolver";
import {
  TelemetryDashboardTimeRangeFactory,
  type TelemetryDashboardTimePreset,
} from "../lib/TelemetryDashboardTimeRangeFactory";
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
  const [selectedModelNames, setSelectedModelNames] = useState<ReadonlyArray<string>>([]);

  const folderOptions = useMemo(
    () =>
      TelemetryDashboardFolderResolver.listFolders(workflows).map((folder) => ({
        value: folder,
        label: folder,
      })),
    [workflows],
  );
  const workflowOptions = useMemo(
    () =>
      workflows.map((workflow) => ({
        value: workflow.id,
        label: workflow.name,
      })),
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
      modelNames: selectedModelNames.length > 0 ? selectedModelNames : undefined,
      startTimeGte: range?.startTimeGte,
      endTimeLte: range?.endTimeLte,
    }),
    [range?.endTimeLte, range?.startTimeGte, resolvedWorkflowIds, selectedModelNames, selectedStatuses],
  );
  const dimensionsFilters = useMemo<TelemetryDashboardFiltersDto>(
    () => ({
      workflowIds: resolvedWorkflowIds,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      startTimeGte: range?.startTimeGte,
      endTimeLte: range?.endTimeLte,
    }),
    [range?.endTimeLte, range?.startTimeGte, resolvedWorkflowIds, selectedStatuses],
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
          modelNames: selectedModelNames.length > 0 ? selectedModelNames : undefined,
        },
      ),
    [customEnd, customStart, resolvedWorkflowIds, selectedModelNames, selectedStatuses, timePreset],
  );
  const queryEnabled = range !== null;
  const summaryQuery = useTelemetryDashboardSummaryQuery(filters, queryEnabled);
  const timeseriesQuery = useTelemetryDashboardTimeseriesQuery(timeseriesRequest, queryEnabled);
  const dimensionsQuery = useTelemetryDashboardDimensionsQuery(dimensionsFilters, queryEnabled);

  const modelOptions = useMemo(
    () =>
      (dimensionsQuery.data?.modelNames ?? []).map((modelName) => ({
        value: modelName,
        label: modelName,
      })),
    [dimensionsQuery.data?.modelNames],
  );
  const loadError =
    (summaryQuery.error instanceof Error ? summaryQuery.error.message : null) ??
    (timeseriesQuery.error instanceof Error ? timeseriesQuery.error.message : null) ??
    (dimensionsQuery.error instanceof Error ? dimensionsQuery.error.message : null) ??
    (workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null);
  const summary = summaryQuery.data;
  const timeseries = timeseriesQuery.data;

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-6" data-testid="dashboard-screen">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
            Codemation telemetry
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Track workflow health, AI usage, and model activity from the same telemetry pipeline that powers deeper
            drilldowns.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
            <Workflow className="size-3.5" />
            {`${String(workflows.length)} workflows`}
          </Badge>
          <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
            <Sparkles className="size-3.5" />
            Telemetry-backed
          </Badge>
        </div>
      </header>

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
        folderOptions={folderOptions}
        selectedFolders={selectedFolders}
        onToggleFolder={(value) =>
          setSelectedFolders((current) =>
            current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
          )
        }
        selectedStatuses={selectedStatuses}
        onToggleStatus={(value) =>
          setSelectedStatuses((current) =>
            current.includes(value as "running" | "completed" | "failed")
              ? current.filter((entry) => entry !== value)
              : [...current, value as "running" | "completed" | "failed"],
          )
        }
        modelOptions={modelOptions}
        selectedModelNames={selectedModelNames}
        onToggleModelName={(value) =>
          setSelectedModelNames((current) =>
            current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
          )
        }
      />

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

      <DashboardMetricGrid summary={summary} />

      {timeseries ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <DashboardRunStatusChart series={timeseries} />
          <DashboardTokenChart series={timeseries} />
        </section>
      ) : null}
    </main>
  );
}
