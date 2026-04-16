import { GenAiTelemetryAttributeNames, inject, injectable } from "@codemation/core";
import type {
  TelemetryDashboardBucketIntervalDto,
  TelemetryDashboardDimensionsDto,
  TelemetryDashboardRunOriginDto,
  TelemetryDashboardRunsDto,
  TelemetryDashboardRunsRequestDto,
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
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { OtelIdentityFactory } from "./OtelIdentityFactory";

export interface TelemetryAggregateFilters {
  readonly workflowId?: string;
  readonly workflowIds?: ReadonlyArray<string>;
  readonly statuses?: ReadonlyArray<TelemetrySpanStatus>;
  readonly runOrigins?: ReadonlyArray<TelemetryDashboardRunOriginDto>;
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
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
    @inject(ApplicationTokens.RunTraceContextRepository)
    private readonly runTraceContextRepository: RunTraceContextRepository,
    @inject(OtelIdentityFactory)
    private readonly otelIdentityFactory: OtelIdentityFactory,
  ) {}

  async summarizeRuns(filters: TelemetryAggregateFilters = {}): Promise<TelemetryRunAggregate> {
    const spans = await this.resolveFilteredWorkflowRunSpans(filters);
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
    const spans = await this.resolveFilteredWorkflowRunSpans(filters);
    if (spans.length === 0) {
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
      };
    }
    const points = await this.listAiMetricPoints(
      filters,
      spans.map((span) => span.runId),
    );
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
    const spans = await this.resolveFilteredWorkflowRunSpans(filters);
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
    const spans = await this.resolveFilteredWorkflowRunSpans(filters);
    if (spans.length === 0) {
      return {
        interval,
        buckets: buckets.map((bucket) => this.toTimeseriesBucketDto(bucket)),
      };
    }
    const points = await this.listAiMetricPoints(
      filters,
      spans.map((span) => span.runId),
    );
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
    const spans = await this.resolveFilteredWorkflowRunSpans(filters);
    if (spans.length === 0) {
      return { modelNames: [] };
    }
    const modelSpans = await this.telemetrySpanStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      runIds: [...new Set(spans.map((span) => span.runId))],
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
      limit: TelemetryQueryService.queryScanLimit + 1,
    });
    this.throwWhenQueryLimitExceeded(modelSpans.length);
    return {
      modelNames: [...new Set(modelSpans.flatMap((span) => (span.modelName ? [span.modelName] : [])))].sort((a, b) =>
        a.localeCompare(b),
      ),
    };
  }

  async listRuns(request: TelemetryDashboardRunsRequestDto): Promise<TelemetryDashboardRunsDto> {
    const spans = await this.resolveFilteredWorkflowRunSpans(request.filters);
    const originByRunId = await this.loadRunOrigins(spans.map((span) => span.runId));
    const items = spans
      .slice()
      .sort((left, right) => right.startTime!.localeCompare(left.startTime!))
      .map((span) => ({
        runId: span.runId,
        workflowId: span.workflowId,
        status: span.status ?? "running",
        origin: originByRunId.get(span.runId) ?? "triggered",
        startedAt: span.startTime ?? span.endTime ?? new Date(0).toISOString(),
        finishedAt: span.endTime,
      }));
    const offset = (request.page - 1) * request.pageSize;
    return {
      items: items.slice(offset, offset + request.pageSize),
      totalCount: items.length,
      page: request.page,
      pageSize: request.pageSize,
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
    return spans.filter((span) => Boolean(span.startTime));
  }

  private sumMetric(
    points: ReadonlyArray<Readonly<{ metricName: string; value: number }>>,
    metricName: string,
  ): number {
    return points.filter((point) => point.metricName === metricName).reduce((sum, point) => sum + point.value, 0);
  }

  private async resolveFilteredWorkflowRunSpans(
    filters: TelemetryAggregateFilters,
  ): Promise<ReadonlyArray<TelemetrySpanRecord>> {
    const spans = await this.listWorkflowRunSpans(filters);
    if (spans.length === 0) {
      return [];
    }
    const eligibleRunIds = await this.resolveEligibleRunIds(filters, spans);
    if (eligibleRunIds === null) {
      return spans;
    }
    return spans.filter((span) => eligibleRunIds.has(span.runId));
  }

  private async resolveEligibleRunIds(
    filters: TelemetryAggregateFilters,
    spans: ReadonlyArray<TelemetrySpanRecord>,
  ): Promise<ReadonlySet<string> | null> {
    let eligibleRunIds: Set<string> | null = null;
    if (filters.modelNames && filters.modelNames.length > 0) {
      eligibleRunIds = await this.listModelMatchedRunIds(filters);
    }
    if (this.shouldApplyRunOriginFilter(filters.runOrigins)) {
      const originMatchedRunIds = await this.listOriginMatchedRunIds(spans, filters.runOrigins!);
      eligibleRunIds = eligibleRunIds ? this.intersectRunIds(eligibleRunIds, originMatchedRunIds) : originMatchedRunIds;
    }
    return eligibleRunIds;
  }

  private async listModelMatchedRunIds(filters: TelemetryAggregateFilters): Promise<Set<string>> {
    const spans = await this.telemetrySpanStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      modelNames: filters.modelNames,
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
      limit: TelemetryQueryService.queryScanLimit + 1,
    });
    this.throwWhenQueryLimitExceeded(spans.length);
    return new Set(spans.map((span) => span.runId));
  }

  private async listOriginMatchedRunIds(
    spans: ReadonlyArray<TelemetrySpanRecord>,
    runOrigins: ReadonlyArray<TelemetryDashboardRunOriginDto>,
  ): Promise<Set<string>> {
    const originByRunId = await this.loadRunOrigins(spans.map((span) => span.runId));
    const matchedRunIds = new Set<string>();
    for (const span of spans) {
      const origin = originByRunId.get(span.runId) ?? "triggered";
      if (runOrigins.includes(origin)) {
        matchedRunIds.add(span.runId);
      }
    }
    return matchedRunIds;
  }

  private async loadRunOrigins(runIds: ReadonlyArray<string>): Promise<Map<string, TelemetryDashboardRunOriginDto>> {
    const uniqueRunIds = [...new Set(runIds)];
    const states = await Promise.all(uniqueRunIds.map(async (runId) => await this.workflowRunRepository.load(runId)));
    const originByRunId = new Map<string, TelemetryDashboardRunOriginDto>();
    for (const state of states) {
      if (!state) {
        continue;
      }
      const mode = state.executionOptions?.mode;
      originByRunId.set(state.runId, mode === "manual" || mode === "debug" ? "manual" : "triggered");
    }
    return originByRunId;
  }

  private intersectRunIds(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
    const intersection = new Set<string>();
    for (const value of left) {
      if (right.has(value)) {
        intersection.add(value);
      }
    }
    return intersection;
  }

  private shouldApplyRunOriginFilter(runOrigins: ReadonlyArray<TelemetryDashboardRunOriginDto> | undefined): boolean {
    return Boolean(runOrigins && runOrigins.length > 0 && runOrigins.length < 2);
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
    if (interval === "minute_5") {
      next.setUTCMinutes(next.getUTCMinutes() + 5, 0, 0);
      return next;
    }
    if (interval === "minute_15") {
      next.setUTCMinutes(next.getUTCMinutes() + 15, 0, 0);
      return next;
    }
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
