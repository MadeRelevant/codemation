"use client";

import type { TelemetryDashboardRunOriginDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import type { TelemetryDashboardTimePreset } from "../lib/TelemetryDashboardTimeRangeFactory";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardChartCard } from "./DashboardChartCard";
import { DashboardFilterCheckbox } from "./DashboardFilterCheckbox";
import {
  DashboardMultiSelect,
  type DashboardMultiSelectHeading,
  type DashboardMultiSelectOption,
} from "./DashboardMultiSelect";

export function DashboardFilterCard(
  props: Readonly<{
    timePreset: TelemetryDashboardTimePreset;
    onTimePresetChange: (value: TelemetryDashboardTimePreset) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (value: string) => void;
    onCustomEndChange: (value: string) => void;
    workflowOptions: ReadonlyArray<DashboardMultiSelectOption | DashboardMultiSelectHeading>;
    selectedWorkflowIds: ReadonlyArray<string>;
    onToggleWorkflowId: (value: string) => void;
    onClearWorkflowIds: () => void;
    folderOptions: ReadonlyArray<DashboardMultiSelectOption>;
    selectedFolders: ReadonlyArray<string>;
    onToggleFolder: (value: string) => void;
    onClearFolders: () => void;
    selectedStatuses: ReadonlyArray<string>;
    onToggleStatus: (value: string) => void;
    selectedRunOrigins: ReadonlyArray<TelemetryDashboardRunOriginDto>;
    onToggleRunOrigin: (value: TelemetryDashboardRunOriginDto) => void;
    modelOptions: ReadonlyArray<DashboardMultiSelectOption>;
    selectedModelNames: ReadonlyArray<string>;
    onToggleModelName: (value: string) => void;
    onClearModelNames: () => void;
  }>,
) {
  return (
    <DashboardChartCard
      title="Filters"
      description="Narrow the dashboard down to the exact slice you want to inspect."
      testId="dashboard-filter-card"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time range</label>
          <Select
            value={props.timePreset}
            onValueChange={(value) => props.onTimePresetChange(value as TelemetryDashboardTimePreset)}
          >
            <SelectTrigger className="w-full" data-testid="dashboard-time-range">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Recent</SelectLabel>
                <SelectItem value="last_5_minutes" data-testid="dashboard-time-range-last-5-minutes">
                  Last 5 minutes
                </SelectItem>
                <SelectItem value="last_15_minutes" data-testid="dashboard-time-range-last-15-minutes">
                  Last 15 minutes
                </SelectItem>
                <SelectItem value="last_30_minutes" data-testid="dashboard-time-range-last-30-minutes">
                  Last 30 minutes
                </SelectItem>
                <SelectItem value="last_hour" data-testid="dashboard-time-range-last-hour">
                  Last hour
                </SelectItem>
                <SelectItem value="last_4_hours" data-testid="dashboard-time-range-last-4-hours">
                  Last 4 hours
                </SelectItem>
                <SelectItem value="last_8_hours" data-testid="dashboard-time-range-last-8-hours">
                  Last 8 hours
                </SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Calendar</SelectLabel>
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
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Custom</SelectLabel>
                <SelectItem value="custom" data-testid="dashboard-time-range-custom">
                  Custom range
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {props.timePreset === "custom" ? (
          <div className="grid gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Custom start
              </label>
              <Input
                type="datetime-local"
                value={props.customStart}
                onChange={(event) => props.onCustomStartChange(event.target.value)}
                data-testid="dashboard-custom-start"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom end</label>
              <Input
                type="datetime-local"
                value={props.customEnd}
                onChange={(event) => props.onCustomEndChange(event.target.value)}
                data-testid="dashboard-custom-end"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarRange className="size-3.5" />
              Custom ranges use UTC timestamps and auto-pick the chart interval.
            </div>
          </div>
        ) : null}
        <Separator />
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflows</label>
          <DashboardMultiSelect
            label="Workflows"
            options={props.workflowOptions}
            selectedValues={props.selectedWorkflowIds}
            onToggleValue={props.onToggleWorkflowId}
            onClearSelection={props.onClearWorkflowIds}
            emptyLabel="No workflows available"
            testId="dashboard-workflow-filter"
            contentClassName="w-[32rem] max-w-[calc(100vw-2rem)]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</label>
          <DashboardMultiSelect
            label="Folders"
            options={props.folderOptions}
            selectedValues={props.selectedFolders}
            onToggleValue={props.onToggleFolder}
            onClearSelection={props.onClearFolders}
            emptyLabel="No folders available"
            testId="dashboard-folder-filter"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</label>
          <div className="flex flex-wrap gap-2" data-testid="dashboard-run-origin-filter">
            {[
              { value: "triggered", label: "Triggered" },
              { value: "manual", label: "Manual" },
            ].map((origin) => (
              <DashboardFilterCheckbox
                key={origin.value}
                label={origin.label}
                checked={props.selectedRunOrigins.includes(origin.value as TelemetryDashboardRunOriginDto)}
                onToggle={() => props.onToggleRunOrigin(origin.value as TelemetryDashboardRunOriginDto)}
                testId={`dashboard-run-origin-pill-${origin.value}`}
              />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statuses</label>
          <div className="flex flex-wrap gap-2" data-testid="dashboard-status-filter">
            {[
              { value: "completed", label: "Completed" },
              { value: "failed", label: "Failed" },
              { value: "running", label: "Running" },
            ].map((status) => (
              <DashboardFilterCheckbox
                key={status.value}
                label={status.label}
                checked={props.selectedStatuses.includes(status.value)}
                onToggle={() => props.onToggleStatus(status.value)}
                testId={`dashboard-status-pill-${status.value}`}
              />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Models</label>
          <DashboardMultiSelect
            label="Models"
            options={props.modelOptions}
            selectedValues={props.selectedModelNames}
            onToggleValue={props.onToggleModelName}
            onClearSelection={props.onClearModelNames}
            emptyLabel="No models in current telemetry slice"
            testId="dashboard-model-filter"
          />
        </div>
      </div>
    </DashboardChartCard>
  );
}
