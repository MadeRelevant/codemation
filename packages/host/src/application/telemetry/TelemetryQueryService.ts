import { GenAiTelemetryAttributeNames, inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type {
  RunTraceContextRepository,
  TelemetryArtifactRecord,
  TelemetryArtifactStore,
  TelemetryMetricPointStore,
  TelemetrySpanRecord,
  TelemetrySpanStatus,
  TelemetrySpanStore,
} from "../../domain/telemetry/TelemetryContracts";
import { OtelIdentityFactory } from "./OtelIdentityFactory";

export interface TelemetryAggregateFilters {
  readonly workflowId?: string;
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

export interface TelemetryRunTraceView {
  readonly traceId: string;
  readonly runId: string;
  readonly spans: ReadonlyArray<TelemetrySpanRecord>;
  readonly artifacts: ReadonlyArray<TelemetryArtifactRecord>;
}

@injectable()
export class TelemetryQueryService {
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
      statuses: filters.statuses,
      names: ["workflow.run"],
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
    const points = await this.telemetryMetricPointStore.list({
      workflowId: filters.workflowId,
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
    });
    return {
      inputTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageInputTokens),
      outputTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageOutputTokens),
      totalTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageTotalTokens),
      cachedInputTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageCacheReadInputTokens),
      reasoningTokens: this.sumMetric(points, GenAiTelemetryAttributeNames.usageReasoningTokens),
    };
  }

  async loadRunTrace(runId: string): Promise<TelemetryRunTraceView> {
    const trace = await this.runTraceContextRepository.load(runId);
    const traceId = trace?.traceId ?? this.otelIdentityFactory.createTraceId(runId);
    const [spans, artifacts] = await Promise.all([
      this.telemetrySpanStore.listByTraceId(traceId),
      this.telemetryArtifactStore.listByTraceId(traceId),
    ]);
    return {
      traceId,
      runId,
      spans,
      artifacts,
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
      statuses: filters.statuses,
      names: ["workflow.run"],
      startTimeGte: filters.startTimeGte,
      endTimeLte: filters.endTimeLte,
    });
    return [...new Set(spans.map((span) => span.runId))];
  }

  private sumMetric(
    points: ReadonlyArray<Readonly<{ metricName: string; value: number }>>,
    metricName: string,
  ): number {
    return points.filter((point) => point.metricName === metricName).reduce((sum, point) => sum + point.value, 0);
  }
}
