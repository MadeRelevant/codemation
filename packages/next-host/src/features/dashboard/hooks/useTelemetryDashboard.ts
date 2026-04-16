"use client";

import type {
  TelemetryDashboardFiltersDto,
  TelemetryDashboardTimeseriesRequestDto,
} from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { useQuery } from "@tanstack/react-query";
import { TelemetryDashboardApi } from "../lib/telemetryDashboardApi";
import {
  telemetryDashboardDimensionsQueryKey,
  telemetryDashboardSummaryQueryKey,
  telemetryDashboardTimeseriesQueryKey,
} from "../lib/telemetryDashboardQueryKeys";

export function useTelemetryDashboardSummaryQuery(filters: TelemetryDashboardFiltersDto, enabled: boolean) {
  const signature = TelemetryDashboardFilterSignature.create(filters);
  return useQuery({
    queryKey: telemetryDashboardSummaryQueryKey(signature),
    queryFn: async () => await TelemetryDashboardApi.fetchSummary(TelemetryDashboardFilterSignature.normalize(filters)),
    enabled,
  });
}

export function useTelemetryDashboardTimeseriesQuery(
  request: TelemetryDashboardTimeseriesRequestDto | null,
  enabled: boolean,
) {
  const signature = request ? JSON.stringify(TelemetryDashboardFilterSignature.normalizeRequest(request)) : "disabled";
  return useQuery({
    queryKey: telemetryDashboardTimeseriesQueryKey(signature),
    queryFn: async () =>
      await TelemetryDashboardApi.fetchTimeseries(TelemetryDashboardFilterSignature.normalizeRequest(request!)),
    enabled: enabled && request !== null,
  });
}

export function useTelemetryDashboardDimensionsQuery(filters: TelemetryDashboardFiltersDto, enabled: boolean) {
  const signature = TelemetryDashboardFilterSignature.create(filters);
  return useQuery({
    queryKey: telemetryDashboardDimensionsQueryKey(signature),
    queryFn: async () =>
      await TelemetryDashboardApi.fetchDimensions(TelemetryDashboardFilterSignature.normalize(filters)),
    enabled,
  });
}

class TelemetryDashboardFilterSignature {
  static create(filters: TelemetryDashboardFiltersDto): string {
    return JSON.stringify(this.normalize(filters));
  }

  static normalize(filters: TelemetryDashboardFiltersDto): TelemetryDashboardFiltersDto {
    return {
      workflowIds: this.sort(filters.workflowIds),
      statuses: this.sort(filters.statuses),
      modelNames: this.sort(filters.modelNames),
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
    };
  }

  static normalizeRequest(request: TelemetryDashboardTimeseriesRequestDto): TelemetryDashboardTimeseriesRequestDto {
    return {
      interval: request.interval,
      filters: this.normalize(request.filters),
    };
  }

  private static sort<TValue extends string>(
    values: ReadonlyArray<TValue> | undefined,
  ): ReadonlyArray<TValue> | undefined {
    return values && values.length > 0 ? [...values].sort((a, b) => a.localeCompare(b)) : undefined;
  }
}
