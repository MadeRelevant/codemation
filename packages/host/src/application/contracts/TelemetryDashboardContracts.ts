import type { TelemetrySpanStatus } from "../../domain/telemetry/TelemetryContracts";

export type TelemetryDashboardBucketIntervalDto = "minute_5" | "minute_15" | "hour" | "day" | "week";
export type TelemetryDashboardRunOriginDto = "triggered" | "manual";

export interface TelemetryDashboardFiltersDto {
  readonly workflowIds?: ReadonlyArray<string>;
  readonly statuses?: ReadonlyArray<TelemetrySpanStatus>;
  readonly runOrigins?: ReadonlyArray<TelemetryDashboardRunOriginDto>;
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

export interface TelemetryDashboardCostKeyTotalDto {
  readonly costKey: string;
  readonly estimatedCostMinor: number;
}

export interface TelemetryDashboardCostCurrencyTotalDto {
  readonly currency: string;
  readonly currencyScale: number;
  readonly estimatedCostMinor: number;
  readonly averageCostPerRunMinor: number;
  readonly costKeys: ReadonlyArray<TelemetryDashboardCostKeyTotalDto>;
}

export interface TelemetryDashboardCostAggregateDto {
  readonly currencies: ReadonlyArray<TelemetryDashboardCostCurrencyTotalDto>;
}

export interface TelemetryDashboardSummaryDto {
  readonly runs: TelemetryDashboardRunAggregateDto;
  readonly ai: TelemetryDashboardAiAggregateDto;
  readonly costs: TelemetryDashboardCostAggregateDto;
}

export interface TelemetryDashboardBucketCostDto {
  readonly currency: string;
  readonly currencyScale: number;
  readonly estimatedCostMinor: number;
  readonly component?: string;
  readonly costKey?: string;
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
  readonly costs: ReadonlyArray<TelemetryDashboardBucketCostDto>;
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

export interface TelemetryDashboardRunsRequestDto {
  readonly filters: TelemetryDashboardFiltersDto;
  readonly page: number;
  readonly pageSize: number;
}

export interface TelemetryDashboardRunListItemDto {
  readonly runId: string;
  readonly workflowId: string;
  readonly status: TelemetrySpanStatus;
  readonly origin: TelemetryDashboardRunOriginDto;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly costs?: ReadonlyArray<TelemetryDashboardBucketCostDto>;
}

export interface TelemetryDashboardRunsDto {
  readonly items: ReadonlyArray<TelemetryDashboardRunListItemDto>;
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}
