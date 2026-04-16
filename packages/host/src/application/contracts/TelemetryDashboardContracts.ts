import type { TelemetrySpanStatus } from "../../domain/telemetry/TelemetryContracts";

export type TelemetryDashboardBucketIntervalDto = "hour" | "day" | "week";

export interface TelemetryDashboardFiltersDto {
  readonly workflowIds?: ReadonlyArray<string>;
  readonly statuses?: ReadonlyArray<TelemetrySpanStatus>;
  readonly modelNames?: ReadonlyArray<string>;
  readonly startTimeGte?: string;
  readonly endTimeLte?: string;
}

export interface TelemetryDashboardRunAggregateDto {
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly failedRuns: number;
  readonly runningRuns: number;
  readonly averageDurationMs: number;
}

export interface TelemetryDashboardAiAggregateDto {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedInputTokens: number;
  readonly reasoningTokens: number;
}

export interface TelemetryDashboardSummaryDto {
  readonly runs: TelemetryDashboardRunAggregateDto;
  readonly ai: TelemetryDashboardAiAggregateDto;
}

export interface TelemetryDashboardTimeseriesBucketDto {
  readonly bucketStartIso: string;
  readonly bucketEndIso: string;
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly failedRuns: number;
  readonly runningRuns: number;
  readonly averageDurationMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedInputTokens: number;
  readonly reasoningTokens: number;
}

export interface TelemetryDashboardTimeseriesDto {
  readonly interval: TelemetryDashboardBucketIntervalDto;
  readonly buckets: ReadonlyArray<TelemetryDashboardTimeseriesBucketDto>;
}

export interface TelemetryDashboardDimensionsDto {
  readonly modelNames: ReadonlyArray<string>;
}

export interface TelemetryDashboardTimeseriesRequestDto {
  readonly filters: TelemetryDashboardFiltersDto;
  readonly interval: TelemetryDashboardBucketIntervalDto;
}
