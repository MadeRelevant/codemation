import type { TelemetryDashboardRunOriginDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import type { TelemetryDashboardTimePreset } from "./TelemetryDashboardTimeRangeFactory";

export interface DashboardPersistedFilters {
  readonly timePreset: TelemetryDashboardTimePreset;
  readonly customStart: string;
  readonly customEnd: string;
  readonly selectedWorkflowIds: ReadonlyArray<string>;
  readonly selectedFolders: ReadonlyArray<string>;
  readonly selectedStatuses: ReadonlyArray<"running" | "completed" | "failed">;
  readonly selectedRunOrigins: ReadonlyArray<TelemetryDashboardRunOriginDto>;
  readonly selectedModelNames: ReadonlyArray<string>;
}

export class DashboardFilterStorage {
  private static readonly storageKey = "codemation.telemetry.dashboard.filters.v1";

  static load(): DashboardPersistedFilters | null {
    const raw = window.localStorage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<DashboardPersistedFilters>;
      if (!parsed.timePreset) {
        return null;
      }
      return {
        timePreset: parsed.timePreset,
        customStart: parsed.customStart ?? "",
        customEnd: parsed.customEnd ?? "",
        selectedWorkflowIds: parsed.selectedWorkflowIds ?? [],
        selectedFolders: parsed.selectedFolders ?? [],
        selectedStatuses: parsed.selectedStatuses ?? [],
        selectedRunOrigins: parsed.selectedRunOrigins ?? ["triggered"],
        selectedModelNames: parsed.selectedModelNames ?? [],
      };
    } catch {
      return null;
    }
  }

  static save(filters: DashboardPersistedFilters): void {
    window.localStorage.setItem(this.storageKey, JSON.stringify(filters));
  }
}
