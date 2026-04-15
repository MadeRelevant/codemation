import type {
  TelemetryDashboardDimensionsDto,
  TelemetryDashboardFiltersDto,
  TelemetryDashboardSummaryDto,
  TelemetryDashboardTimeseriesRequestDto,
  TelemetryDashboardTimeseriesDto,
} from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { ApiPaths } from "@codemation/host";
import { codemationApiClient } from "../../../api/CodemationApiClient";

export class TelemetryDashboardApi {
  static async fetchSummary(filters: TelemetryDashboardFiltersDto): Promise<TelemetryDashboardSummaryDto> {
    return await codemationApiClient.getJson<TelemetryDashboardSummaryDto>(
      this.withFilters(ApiPaths.telemetryDashboardSummary(), filters),
    );
  }

  static async fetchTimeseries(
    request: TelemetryDashboardTimeseriesRequestDto,
  ): Promise<TelemetryDashboardTimeseriesDto> {
    const url = new URL(ApiPaths.telemetryDashboardTimeseries(), "http://localhost");
    this.appendFilters(url, request.filters);
    url.searchParams.set("interval", request.interval);
    return await codemationApiClient.getJson<TelemetryDashboardTimeseriesDto>(this.toRelativeUrl(url));
  }

  static async fetchDimensions(filters: TelemetryDashboardFiltersDto): Promise<TelemetryDashboardDimensionsDto> {
    return await codemationApiClient.getJson<TelemetryDashboardDimensionsDto>(
      this.withFilters(ApiPaths.telemetryDashboardDimensions(), filters),
    );
  }

  private static withFilters(path: string, filters: TelemetryDashboardFiltersDto): string {
    const url = new URL(path, "http://localhost");
    this.appendFilters(url, filters);
    return this.toRelativeUrl(url);
  }

  private static appendFilters(url: URL, filters: TelemetryDashboardFiltersDto): void {
    for (const workflowId of filters.workflowIds ?? []) {
      url.searchParams.append("workflowId", workflowId);
    }
    for (const status of filters.statuses ?? []) {
      url.searchParams.append("status", status);
    }
    for (const modelName of filters.modelNames ?? []) {
      url.searchParams.append("modelName", modelName);
    }
    if (filters.startTimeGte) {
      url.searchParams.set("startTimeGte", filters.startTimeGte);
    }
    if (filters.endTimeLte) {
      url.searchParams.set("endTimeLte", filters.endTimeLte);
    }
  }

  private static toRelativeUrl(url: URL): string {
    return `${url.pathname}${url.search}`;
  }
}
