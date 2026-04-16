export const telemetryDashboardSummaryQueryKey = (signature: string) =>
  ["telemetry-dashboard-summary", signature] as const;

export const telemetryDashboardTimeseriesQueryKey = (signature: string) =>
  ["telemetry-dashboard-timeseries", signature] as const;

export const telemetryDashboardDimensionsQueryKey = (signature: string) =>
  ["telemetry-dashboard-dimensions", signature] as const;

export const telemetryDashboardRunsQueryKey = (signature: string) => ["telemetry-dashboard-runs", signature] as const;
