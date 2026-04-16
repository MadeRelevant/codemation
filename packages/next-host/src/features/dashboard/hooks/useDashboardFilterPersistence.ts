"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import type { DashboardPersistedFilters } from "../lib/DashboardFilterStorage";
import { DashboardFilterStorage } from "../lib/DashboardFilterStorage";

export function useDashboardFilterPersistence(
  args: Readonly<{
    current: DashboardPersistedFilters;
    hasLoadedStoredFilters: boolean;
    setHasLoadedStoredFilters: Dispatch<SetStateAction<boolean>>;
    setTimePreset: Dispatch<SetStateAction<DashboardPersistedFilters["timePreset"]>>;
    setCustomStart: Dispatch<SetStateAction<string>>;
    setCustomEnd: Dispatch<SetStateAction<string>>;
    setSelectedWorkflowIds: Dispatch<SetStateAction<DashboardPersistedFilters["selectedWorkflowIds"]>>;
    setSelectedFolders: Dispatch<SetStateAction<DashboardPersistedFilters["selectedFolders"]>>;
    setSelectedStatuses: Dispatch<SetStateAction<DashboardPersistedFilters["selectedStatuses"]>>;
    setSelectedRunOrigins: Dispatch<SetStateAction<DashboardPersistedFilters["selectedRunOrigins"]>>;
    setSelectedModelNames: Dispatch<SetStateAction<DashboardPersistedFilters["selectedModelNames"]>>;
  }>,
) {
  useEffect(() => {
    const stored = DashboardFilterStorage.load();
    if (!stored) {
      args.setHasLoadedStoredFilters(true);
      return;
    }
    args.setTimePreset(stored.timePreset);
    args.setCustomStart(stored.customStart);
    args.setCustomEnd(stored.customEnd);
    args.setSelectedWorkflowIds(stored.selectedWorkflowIds);
    args.setSelectedFolders(stored.selectedFolders);
    args.setSelectedStatuses(stored.selectedStatuses);
    args.setSelectedRunOrigins(stored.selectedRunOrigins);
    args.setSelectedModelNames(stored.selectedModelNames);
    args.setHasLoadedStoredFilters(true);
  }, []);

  useEffect(() => {
    if (!args.hasLoadedStoredFilters) {
      return;
    }
    DashboardFilterStorage.save(args.current);
  }, [args.current, args.hasLoadedStoredFilters]);
}
