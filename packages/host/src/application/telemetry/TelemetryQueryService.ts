import {
  CostTrackingTelemetryAttributeNames,
  CostTrackingTelemetryMetricNames,
  GenAiTelemetryAttributeNames,
  inject,
  injectable,
} from "@codemation/core";
import type {
  TelemetryDashboardCostAggregateDto,
  TelemetryDashboardCostCurrencyTotalDto,
  TelemetryDashboardCostKeyTotalDto,
  TelemetryDashboardBucketIntervalDto,
  TelemetryDashboardBucketCostDto,
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

export interface TelemetryCostCurrencyAggregate {
  readonly currency: string;
  readonly currencyScale: number;
  readonly estimatedCostMinor: number;
  readonly averageCostPerRunMinor: number;
  readonly costKeys: ReadonlyArray<TelemetryDashboardCostKeyTotalDto>;
}

export interface TelemetryCostAggregate {
  readonly currencies: ReadonlyArray<TelemetryCostCurrencyAggregate>;
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

  async summarizeCosts(filters: TelemetryAggregateFilters = {}): Promise<TelemetryDashboardCostAggregateDto> {
    const spans = await this.resolveFilteredWorkflowRunSpans(filters);
    if (spans.length === 0) {
      return { currencies: [] };
    }
    const costModelNamesBySpanId = await this.loadCostModelNamesBySpanId(
      filters,
      spans.map((span) => span.runId),
    );
    const points = await this.listCostMetricPoints(
      filters,
      spans.map((span) => span.runId),
    );
    return {
      currencies: this.buildCostCurrencyTotals(points, spans.length, costModelNamesBySpanId),
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

  async summarizeCostsTimeseries(
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
    const costModelNamesBySpanId = await this.loadCostModelNamesBySpanId(
      filters,
      spans.map((span) => span.runId),
    );
    const points = await this.listCostMetricPoints(
      filters,
      spans.map((span) => span.runId),
    );
    for (const point of points) {
      const bucket = this.findBucket(buckets, point.observedAt);
      if (!bucket) {
        continue;
      }
      this.addCostPointToBucket(bucket, point, costModelNamesBySpanId);
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
    const costsByRunId = await this.loadCostsByRunId(
      request.filters,
      spans.map((span) => span.runId),
    );
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
        costs: costsByRunId.get(span.runId) ?? [],
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

  private async listCostMetricPoints(
    filters: TelemetryAggregateFilters,
    runIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<TelemetryMetricPointRecord>> {
    const points = await this.telemetryMetricPointStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      runIds: runIds.length > 0 ? runIds : undefined,
      modelNames: filters.modelNames,
      metricNames: [CostTrackingTelemetryMetricNames.estimatedCost],
      observedAtGte: filters.startTimeGte,
      observedAtLte: filters.endTimeLte,
      limit: TelemetryQueryService.queryScanLimit + 1,
    });
    this.throwWhenQueryLimitExceeded(points.length);
    return points;
  }

  private async loadCostsByRunId(
    filters: TelemetryAggregateFilters,
    runIds: ReadonlyArray<string>,
  ): Promise<Map<string, ReadonlyArray<TelemetryDashboardBucketCostDto>>> {
    if (runIds.length === 0) {
      return new Map();
    }
    const points = await this.listCostMetricPoints(filters, runIds);
    const totalsByRunId = new Map<string, Map<string, CostCurrencyAccumulator>>();
    for (const point of points) {
      if (!point.runId) {
        continue;
      }
      const currency = this.readCostCurrency(point);
      const currencyScale = this.readCostCurrencyScale(point);
      if (!currency || currencyScale === undefined) {
        continue;
      }
      const totals = this.getOrCreateRunCostTotals(totalsByRunId, point.runId);
      this.accumulateCostTotal(totals, currency, currencyScale, point.value);
    }
    return new Map([...totalsByRunId.entries()].map(([runId, totals]) => [runId, this.toCostDtos(totals)]));
  }

  private buildCostCurrencyTotals(
    points: ReadonlyArray<TelemetryMetricPointRecord>,
    runCount: number,
    costModelNamesBySpanId: ReadonlyMap<string, string>,
  ): ReadonlyArray<TelemetryDashboardCostCurrencyTotalDto> {
    const totals = new Map<string, CostCurrencyAggregateAccumulator>();
    for (const point of points) {
      const currency = this.readCostCurrency(point);
      const currencyScale = this.readCostCurrencyScale(point);
      if (!currency || currencyScale === undefined) {
        continue;
      }
      const costKey = this.readCostKey(point, costModelNamesBySpanId);
      const aggregate = this.getOrCreateCostAggregate(totals, currency, currencyScale);
      aggregate.estimatedCostMinor += point.value;
      if (costKey) {
        aggregate.costKeyTotals.set(costKey, (aggregate.costKeyTotals.get(costKey) ?? 0) + point.value);
      }
    }
    return [...totals.values()]
      .map((aggregate) => ({
        currency: aggregate.currency,
        currencyScale: aggregate.currencyScale,
        estimatedCostMinor: aggregate.estimatedCostMinor,
        averageCostPerRunMinor: runCount === 0 ? 0 : Math.round(aggregate.estimatedCostMinor / runCount),
        costKeys: [...aggregate.costKeyTotals.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([costKey, estimatedCostMinor]) => ({
            costKey,
            estimatedCostMinor,
          })),
      }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
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
        costs: new Map(),
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
      costs: this.toCostDtos(bucket.costs),
    };
  }

  private addCostPointToBucket(
    bucket: TelemetryTimeseriesBucket,
    point: TelemetryMetricPointRecord,
    costModelNamesBySpanId: ReadonlyMap<string, string>,
  ): void {
    const currency = this.readCostCurrency(point);
    const currencyScale = this.readCostCurrencyScale(point);
    if (!currency || currencyScale === undefined) {
      return;
    }
    this.accumulateCostTotal(
      bucket.costs,
      currency,
      currencyScale,
      point.value,
      this.readCostComponent(point),
      this.readCostKey(point, costModelNamesBySpanId),
    );
  }

  private toCostDtos(
    totals: ReadonlyMap<string, CostCurrencyAccumulator>,
  ): ReadonlyArray<TelemetryDashboardBucketCostDto> {
    return [...totals.values()]
      .map((entry) => ({
        currency: entry.currency,
        currencyScale: entry.currencyScale,
        estimatedCostMinor: entry.estimatedCostMinor,
        component: entry.component,
        costKey: entry.costKey,
      }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
  }

  private accumulateCostTotal(
    totals: Map<string, CostCurrencyAccumulator>,
    currency: string,
    currencyScale: number,
    value: number,
    component?: string,
    costKey?: string,
  ): void {
    const key = this.createCostCurrencyKey(currency, currencyScale, component, costKey);
    const existing = totals.get(key);
    if (existing) {
      existing.estimatedCostMinor += value;
      return;
    }
    totals.set(key, {
      currency,
      currencyScale,
      estimatedCostMinor: value,
      component,
      costKey,
    });
  }

  private getOrCreateRunCostTotals(
    totalsByRunId: Map<string, Map<string, CostCurrencyAccumulator>>,
    runId: string,
  ): Map<string, CostCurrencyAccumulator> {
    const existing = totalsByRunId.get(runId);
    if (existing) {
      return existing;
    }
    const totals = new Map<string, CostCurrencyAccumulator>();
    totalsByRunId.set(runId, totals);
    return totals;
  }

  private getOrCreateCostAggregate(
    totals: Map<string, CostCurrencyAggregateAccumulator>,
    currency: string,
    currencyScale: number,
  ): CostCurrencyAggregateAccumulator {
    const key = this.createCostCurrencyKey(currency, currencyScale);
    const existing = totals.get(key);
    if (existing) {
      return existing;
    }
    const aggregate: CostCurrencyAggregateAccumulator = {
      currency,
      currencyScale,
      estimatedCostMinor: 0,
      costKeyTotals: new Map(),
    };
    totals.set(key, aggregate);
    return aggregate;
  }

  private createCostCurrencyKey(currency: string, currencyScale: number, component?: string, costKey?: string): string {
    return `${currency}::${String(currencyScale)}::${component ?? ""}::${costKey ?? ""}`;
  }

  private readCostComponent(point: TelemetryMetricPointRecord): string | undefined {
    return this.readStringDimension(point, CostTrackingTelemetryAttributeNames.component);
  }

  private readCostKey(
    point: TelemetryMetricPointRecord,
    costModelNamesBySpanId: ReadonlyMap<string, string>,
  ): string | undefined {
    return (
      point.modelName ??
      (point.spanId ? costModelNamesBySpanId.get(point.spanId) : undefined) ??
      this.readStringDimension(point, CostTrackingTelemetryAttributeNames.pricingKey) ??
      this.readStringDimension(point, CostTrackingTelemetryAttributeNames.provider) ??
      this.readStringDimension(point, CostTrackingTelemetryAttributeNames.component)
    );
  }

  private async loadCostModelNamesBySpanId(
    filters: TelemetryAggregateFilters,
    runIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, string>> {
    if (runIds.length === 0) {
      return new Map();
    }
    const spans = await this.telemetrySpanStore.list({
      workflowId: filters.workflowId,
      workflowIds: filters.workflowIds,
      runIds: [...new Set(runIds)],
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
      limit: TelemetryQueryService.queryScanLimit + 1,
    });
    this.throwWhenQueryLimitExceeded(spans.length);
    return new Map(
      spans
        .filter((span): span is TelemetrySpanRecord & { modelName: string } => typeof span.modelName === "string")
        .map((span) => [span.spanId, span.modelName] as const),
    );
  }

  private readCostCurrency(point: TelemetryMetricPointRecord): string | undefined {
    return this.readStringDimension(point, CostTrackingTelemetryAttributeNames.currency) ?? point.unit;
  }

  private readCostCurrencyScale(point: TelemetryMetricPointRecord): number | undefined {
    const value = point.dimensions?.[CostTrackingTelemetryAttributeNames.currencyScale];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private readStringDimension(point: TelemetryMetricPointRecord, key: string): string | undefined {
    const value = point.dimensions?.[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
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
  costs: Map<string, CostCurrencyAccumulator>;
}

interface CostCurrencyAccumulator {
  readonly currency: string;
  readonly currencyScale: number;
  estimatedCostMinor: number;
  readonly component?: string;
  readonly costKey?: string;
}

interface CostCurrencyAggregateAccumulator extends CostCurrencyAccumulator {
  readonly costKeyTotals: Map<string, number>;
}
