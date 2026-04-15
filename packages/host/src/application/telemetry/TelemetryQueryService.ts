import { GenAiTelemetryAttributeNames, inject, injectable } from "@codemation/core";
import type {
  TelemetryDashboardBucketIntervalDto,
  TelemetryDashboardDimensionsDto,
  TelemetryDashboardTimeseriesBucketDto,
  TelemetryDashboardTimeseriesDto,
} from "../contracts/TelemetryDashboardContracts";
import type { TelemetryRunTraceViewDto } from "../contracts/TelemetryRunTraceContracts";
import { ApplicationTokens } from "../../applicationTokens";
import type {
  RunTraceContextRepository,
  TelemetryArtifactStore,
  TelemetryMetricPointRecord,
  TelemetryMetricPointStore,
  TelemetrySpanRecord,
  TelemetrySpanStatus,
  TelemetrySpanStore,
} from "../../domain/telemetry/TelemetryContracts";
import { OtelIdentityFactory } from "./OtelIdentityFactory";

export interface TelemetryAggregateFilters {
  readonly workflowId?: string;
  readonly workflowIds?: ReadonlyArray<string>;
  readonly statuses?: ReadonlyArray<TelemetrySpanStatus>;
  readonly modelNames?: ReadonlyArray<string>;
  readonly startTimeGte?: string;
  readonly endTimeLte?: string;
}

export interface TelemetryRunAggregate {
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly failedRuns: number;
  readonly runningRuns: number;
  readonly averageDurationMs: number;
}

export interface TelemetryAiAggregate {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedInputTokens: number;
  readonly reasoningTokens: number;
}

@injectable()
export class TelemetryQueryService {
  private static readonly workflowRunSpanName = "workflow.run";
  private static readonly queryScanLimit = 50_000;
  private static readonly maxBucketCount = 180;

  constructor(
    @inject(ApplicationTokens.TelemetrySpanStore)
    private readonly telemetrySpanStore: TelemetrySpanStore,
    @inject(ApplicationTokens.TelemetryArtifactStore)
    private readonly telemetryArtifactStore: TelemetryArtifactStore,
    @inject(ApplicationTokens.TelemetryMetricPointStore)
    private readonly telemetryMetricPointStore: TelemetryMetricPointStore,
    @inject(ApplicationTokens.RunTraceContextRepository)
    private readonly runTraceContextRepository: RunTraceContextRepository,
    @inject(OtelIdentityFactory)
    private readonly otelIdentityFactory: OtelIdentityFactory,
  ) {}

  async summarizeRuns(filters: TelemetryAggregateFilters = {}): Promise<TelemetryRunAggregate> {
    const spans = await this.telemetrySpanStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      statuses: filters.statuses,
      names: [TelemetryQueryService.workflowRunSpanName],
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
    });
    const totalDurationMs = spans.reduce((sum, span) => sum + this.durationMs(span), 0);
    const totalRuns = spans.length;
    return {
      totalRuns,
      completedRuns: spans.filter((span) => span.status === "completed").length,
      failedRuns: spans.filter((span) => span.status === "failed").length,
      runningRuns: spans.filter((span) => span.status === "running").length,
      averageDurationMs: totalRuns === 0 ? 0 : Math.round(totalDurationMs / totalRuns),
    };
  }

  async summarizeAiUsage(filters: TelemetryAggregateFilters = {}): Promise<TelemetryAiAggregate> {
    const runIds = await this.resolveRunIds(filters);
    if (filters.statuses && filters.statuses.length > 0 && runIds.length === 0) {
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
      };
    }
    const points = await this.listAiMetricPoints(filters, runIds);
    return {
      inputTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageInputTokens),
      outputTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageOutputTokens),
      totalTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageTotalTokens),
      cachedInputTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageCacheReadInputTokens),
      reasoningTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageReasoningTokens),
    };
  }

  async summarizeRunsTimeseries(
    filters: TelemetryAggregateFilters,
    interval: TelemetryDashboardBucketIntervalDto,
  ): Promise<TelemetryDashboardTimeseriesDto> {
    const buckets = this.createBuckets(filters, interval);
    const spans = await this.listWorkflowRunSpans(filters);
    for (const span of spans) {
      const bucket = this.findBucket(buckets, span.endTime ?? span.startTime);
      if (!bucket) {
        continue;
      }
      bucket.totalRuns += 1;
      if (span.status === "completed") {
        bucket.completedRuns += 1;
      } else if (span.status === "failed") {
        bucket.failedRuns += 1;
      } else if (span.status === "running") {
        bucket.runningRuns += 1;
      }
      bucket.averageDurationMs += this.durationMs(span);
      bucket.durationSamples += 1;
    }
    return {
      interval,
      buckets: buckets.map((bucket) => this.toTimeseriesBucketDto(bucket)),
    };
  }

  async summarizeAiUsageTimeseries(
    filters: TelemetryAggregateFilters,
    interval: TelemetryDashboardBucketIntervalDto,
  ): Promise<TelemetryDashboardTimeseriesDto> {
    const buckets = this.createBuckets(filters, interval);
    const runIds = await this.resolveRunIds(filters);
    if (filters.statuses && filters.statuses.length > 0 && runIds.length === 0) {
      return {
        interval,
        buckets: buckets.map((bucket) => this.toTimeseriesBucketDto(bucket)),
      };
    }
    const points = await this.listAiMetricPoints(filters, runIds);
    for (const point of points) {
      const bucket = this.findBucket(buckets, point.observedAt);
      if (!bucket) {
        continue;
      }
      if (point.metricName === GenAiTelemetryAttributeNames.usageInputTokens) {
        bucket.inputTokens += point.value;
      } else if (point.metricName === GenAiTelemetryAttributeNames.usageOutputTokens) {
        bucket.outputTokens += point.value;
      } else if (point.metricName === GenAiTelemetryAttributeNames.usageTotalTokens) {
        bucket.totalTokens += point.value;
      } else if (point.metricName === GenAiTelemetryAttributeNames.usageCacheReadInputTokens) {
        bucket.cachedInputTokens += point.value;
      } else if (point.metricName === GenAiTelemetryAttributeNames.usageReasoningTokens) {
        bucket.reasoningTokens += point.value;
      }
    }
    return {
      interval,
      buckets: buckets.map((bucket) => this.toTimeseriesBucketDto(bucket)),
    };
  }

  async listModelNames(filters: TelemetryAggregateFilters = {}): Promise<TelemetryDashboardDimensionsDto> {
    const runIds = await this.resolveRunIds(filters);
    if (filters.statuses && filters.statuses.length > 0 && runIds.length === 0) {
      return { modelNames: [] };
    }
    const spans = await this.telemetrySpanStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      runIds: runIds.length > 0 ? runIds : undefined,
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
      limit: TelemetryQueryService.queryScanLimit + 1,
    });
    this.throwWhenQueryLimitExceeded(spans.length);
    return {
      modelNames: [...new Set(spans.flatMap((span) => (span.modelName ? [span.modelName] : [])))].sort((a, b) =>
        a.localeCompare(b),
      ),
    };
  }

  async loadRunTrace(runId: string): Promise<TelemetryRunTraceViewDto> {
    const trace = await this.runTraceContextRepository.load(runId);
    const traceId = trace?.traceId ?? this.otelIdentityFactory.createTraceId(runId);
    const [spans, artifacts, metricPoints] = await Promise.all([
      this.telemetrySpanStore.listByTraceId(traceId),
      this.telemetryArtifactStore.listByTraceId(traceId),
      this.telemetryMetricPointStore.list({
        runId,
        traceId,
        limit: TelemetryQueryService.queryScanLimit + 1,
      }),
    ]);
    this.throwWhenQueryLimitExceeded(metricPoints.length);
    return {
      traceId,
      runId,
      spans,
      artifacts,
      metricPoints,
    };
  }

  private durationMs(span: TelemetrySpanRecord): number {
    if (!span.startTime || !span.endTime) {
      return 0;
    }
    return Math.max(0, new Date(span.endTime).getTime() - new Date(span.startTime).getTime());
  }

  private async resolveRunIds(filters: TelemetryAggregateFilters): Promise<ReadonlyArray<string>> {
    if (!filters.statuses || filters.statuses.length === 0) {
      return [];
    }
    const spans = await this.telemetrySpanStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      statuses: filters.statuses,
      names: [TelemetryQueryService.workflowRunSpanName],
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
      limit: TelemetryQueryService.queryScanLimit + 1,
    });
    this.throwWhenQueryLimitExceeded(spans.length);
    return [...new Set(spans.map((span) => span.runId))];
  }

  private sumMetric(
    points: ReadonlyArray<Readonly<{ metricName: string; value: number }>>,
    metricName: string,
  ): number {
    return points.filter((point) => point.metricName === metricName).reduce((sum, point) => sum + point.value, 0);
  }

  private async listWorkflowRunSpans(filters: TelemetryAggregateFilters): Promise<ReadonlyArray<TelemetrySpanRecord>> {
    const spans = await this.telemetrySpanStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      statuses: filters.statuses,
      names: [TelemetryQueryService.workflowRunSpanName],
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
      limit: TelemetryQueryService.queryScanLimit + 1,
    });
    this.throwWhenQueryLimitExceeded(spans.length);
    return spans;
  }

  private async listAiMetricPoints(
    filters: TelemetryAggregateFilters,
    runIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<TelemetryMetricPointRecord>> {
    const points = await this.telemetryMetricPointStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      runIds: runIds.length > 0 ? runIds : undefined,
      modelNames: filters.modelNames,
      metricNames: [
        GenAiTelemetryAttributeNames.usageInputTokens,
        GenAiTelemetryAttributeNames.usageOutputTokens,
        GenAiTelemetryAttributeNames.usageTotalTokens,
        GenAiTelemetryAttributeNames.usageCacheReadInputTokens,
        GenAiTelemetryAttributeNames.usageReasoningTokens,
      ],
      observedAtGte: filters.startTimeGte,
      observedAtLte: filters.endTimeLte,
      limit: TelemetryQueryService.queryScanLimit + 1,
    });
    this.throwWhenQueryLimitExceeded(points.length);
    return points;
  }

  private createBuckets(
    filters: TelemetryAggregateFilters,
    interval: TelemetryDashboardBucketIntervalDto,
  ): Array<TelemetryTimeseriesBucket> {
    if (!filters.startTimeGte || !filters.endTimeLte) {
      throw new Error("Dashboard timeseries requires startTimeGte and endTimeLte.");
    }
    const buckets: Array<TelemetryTimeseriesBucket> = [];
    const cursor = new Date(filters.startTimeGte);
    const end = new Date(filters.endTimeLte);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) {
      throw new Error("Dashboard timeseries requires a valid date range.");
    }
    while (cursor <= end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = this.advanceBucket(cursor, interval);
      buckets.push({
        bucketStartIso: bucketStart.toISOString(),
        bucketEndIso: bucketEnd.toISOString(),
        totalRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        runningRuns: 0,
        averageDurationMs: 0,
        durationSamples: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
      });
      cursor.setTime(bucketEnd.getTime());
      if (buckets.length > TelemetryQueryService.maxBucketCount) {
        throw new Error(`Dashboard timeseries exceeded ${String(TelemetryQueryService.maxBucketCount)} buckets.`);
      }
    }
    return buckets;
  }

  private advanceBucket(cursor: Date, interval: TelemetryDashboardBucketIntervalDto): Date {
    const next = new Date(cursor);
    if (interval === "hour") {
      next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
      return next;
    }
    if (interval === "day") {
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  private findBucket(
    buckets: ReadonlyArray<TelemetryTimeseriesBucket>,
    observedAtIso: string | undefined,
  ): TelemetryTimeseriesBucket | undefined {
    if (!observedAtIso) {
      return undefined;
    }
    const observedAt = new Date(observedAtIso).getTime();
    if (Number.isNaN(observedAt)) {
      return undefined;
    }
    return buckets.find((bucket) => {
      const start = new Date(bucket.bucketStartIso).getTime();
      const end = new Date(bucket.bucketEndIso).getTime();
      return observedAt >= start && observedAt < end;
    });
  }

  private toTimeseriesBucketDto(bucket: TelemetryTimeseriesBucket): TelemetryDashboardTimeseriesBucketDto {
    return {
      bucketStartIso: bucket.bucketStartIso,
      bucketEndIso: bucket.bucketEndIso,
      totalRuns: bucket.totalRuns,
      completedRuns: bucket.completedRuns,
      failedRuns: bucket.failedRuns,
      runningRuns: bucket.runningRuns,
      averageDurationMs:
        bucket.durationSamples === 0 ? 0 : Math.round(bucket.averageDurationMs / bucket.durationSamples),
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      totalTokens: bucket.totalTokens,
      cachedInputTokens: bucket.cachedInputTokens,
      reasoningTokens: bucket.reasoningTokens,
    };
  }

  private throwWhenQueryLimitExceeded(rowCount: number): void {
    if (rowCount > TelemetryQueryService.queryScanLimit) {
      throw new Error(`Telemetry dashboard query exceeded ${String(TelemetryQueryService.queryScanLimit)} rows.`);
    }
  }
}

interface TelemetryTimeseriesBucket {
  readonly bucketStartIso: string;
  readonly bucketEndIso: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  averageDurationMs: number;
  durationSamples: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
}
