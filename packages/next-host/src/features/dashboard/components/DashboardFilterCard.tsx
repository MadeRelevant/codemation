"use client";

import type { TelemetryDashboardTimePreset } from "../lib/TelemetryDashboardTimeRangeFactory";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardChartCard } from "./DashboardChartCard";
import { DashboardMultiSelect, type DashboardMultiSelectOption } from "./DashboardMultiSelect";

export function DashboardFilterCard(
  props: Readonly<{
    timePreset: TelemetryDashboardTimePreset;
    onTimePresetChange: (value: TelemetryDashboardTimePreset) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (value: string) => void;
    onCustomEndChange: (value: string) => void;
    workflowOptions: ReadonlyArray<DashboardMultiSelectOption>;
    selectedWorkflowIds: ReadonlyArray<string>;
    onToggleWorkflowId: (value: string) => void;
    folderOptions: ReadonlyArray<DashboardMultiSelectOption>;
    selectedFolders: ReadonlyArray<string>;
    onToggleFolder: (value: string) => void;
    selectedStatuses: ReadonlyArray<string>;
    onToggleStatus: (value: string) => void;
    modelOptions: ReadonlyArray<DashboardMultiSelectOption>;
    selectedModelNames: ReadonlyArray<string>;
    onToggleModelName: (value: string) => void;
  }>,
) {
  return (
    <DashboardChartCard
      title="Filters"
      description="Refine the metrics by time window, workflow slice, status, and model family."
      testId="dashboard-filter-card"
    >
      <div className="grid gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time range</label>
          <Select
            value={props.timePreset}
            onValueChange={(value) => props.onTimePresetChange(value as TelemetryDashboardTimePreset)}
          >
            <SelectTrigger className="w-full" data-testid="dashboard-time-range">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today" data-testid="dashboard-time-range-today">
                Today
              </SelectItem>
              <SelectItem value="yesterday" data-testid="dashboard-time-range-yesterday">
                Yesterday
              </SelectItem>
              <SelectItem value="this_week" data-testid="dashboard-time-range-this-week">
                This week
              </SelectItem>
              <SelectItem value="last_2_weeks" data-testid="dashboard-time-range-last-2-weeks">
                Last 2 weeks
              </SelectItem>
              <SelectItem value="this_month" data-testid="dashboard-time-range-this-month">
                This month
              </SelectItem>
              <SelectItem value="this_quarter" data-testid="dashboard-time-range-this-quarter">
                This quarter
              </SelectItem>
              <SelectItem value="this_year" data-testid="dashboard-time-range-this-year">
                This year
              </SelectItem>
              <SelectItem value="custom" data-testid="dashboard-time-range-custom">
                Custom
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflows</label>
          <DashboardMultiSelect
            label="Workflows"
            options={props.workflowOptions}
            selectedValues={props.selectedWorkflowIds}
            onToggleValue={props.onToggleWorkflowId}
            emptyLabel="No workflows available"
            testId="dashboard-workflow-filter"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</label>
          <DashboardMultiSelect
            label="Folders"
            options={props.folderOptions}
            selectedValues={props.selectedFolders}
            onToggleValue={props.onToggleFolder}
            emptyLabel="No folders available"
            testId="dashboard-folder-filter"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statuses</label>
          <DashboardMultiSelect
            label="Statuses"
            options={[
              { value: "completed", label: "Completed" },
              { value: "failed", label: "Failed" },
              { value: "running", label: "Running" },
            ]}
            selectedValues={props.selectedStatuses}
            onToggleValue={props.onToggleStatus}
            testId="dashboard-status-filter"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Models</label>
          <DashboardMultiSelect
            label="Models"
            options={props.modelOptions}
            selectedValues={props.selectedModelNames}
            onToggleValue={props.onToggleModelName}
            emptyLabel="No models in current telemetry slice"
            testId="dashboard-model-filter"
          />
        </div>
      </div>
      {props.timePreset === "custom" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom start</label>
            <Input
              type="datetime-local"
              value={props.customStart}
              onChange={(event) => props.onCustomStartChange(event.target.value)}
              data-testid="dashboard-custom-start"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom end</label>
            <Input
              type="datetime-local"
              value={props.customEnd}
              onChange={(event) => props.onCustomEndChange(event.target.value)}
              data-testid="dashboard-custom-end"
            />
          </div>
        </div>
      ) : null}
      {props.timePreset === "custom" ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarRange className="size-3.5" />
          Custom ranges use UTC timestamps and pick the chart interval automatically.
        </div>
      ) : null}
    </DashboardChartCard>
  );
}
