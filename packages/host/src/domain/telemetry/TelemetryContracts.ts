import type {
  TelemetryArtifactAttachment,
  TelemetryAttributes,
  TelemetryMetricRecord,
  TelemetrySpanEventRecord,
} from "@codemation/core";

export type TelemetrySpanStatus = "running" | "completed" | "failed";
export type TelemetrySpanKind = "internal" | "client";

export interface TelemetryTraceContext {
  readonly runId: string;
  readonly workflowId: string;
  readonly traceId: string;
  readonly rootSpanId: string;
  readonly serviceName?: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

export interface TelemetrySpanRecord {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly runId: string;
  readonly workflowId: string;
  readonly nodeId?: string;
  readonly activationId?: string;
  readonly connectionInvocationId?: string;
  readonly name: string;
  readonly kind: TelemetrySpanKind;
  readonly status?: TelemetrySpanStatus;
  readonly statusMessage?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly workflowFolder?: string;
  readonly nodeType?: string;
  readonly nodeRole?: string;
  readonly modelName?: string;
  readonly attributes?: TelemetryAttributes;
  readonly events?: ReadonlyArray<TelemetrySpanEventRecord>;
  readonly retentionExpiresAt?: string;
}

export interface TelemetrySpanUpsert {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly runId: string;
  readonly workflowId: string;
  readonly nodeId?: string;
  readonly activationId?: string;
  readonly connectionInvocationId?: string;
  readonly name?: string;
  readonly kind?: TelemetrySpanKind;
  readonly status?: TelemetrySpanStatus;
  readonly statusMessage?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly workflowFolder?: string;
  readonly nodeType?: string;
  readonly nodeRole?: string;
  readonly modelName?: string;
  readonly attributes?: TelemetryAttributes;
  readonly events?: ReadonlyArray<TelemetrySpanEventRecord>;
  readonly retentionExpiresAt?: string;
}

export interface TelemetryArtifactRecord {
  readonly artifactId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly runId: string;
  readonly workflowId: string;
  readonly nodeId?: string;
  readonly activationId?: string;
  readonly kind: string;
  readonly contentType: string;
  readonly previewText?: string;
  readonly previewJson?: unknown;
  readonly payloadText?: string;
  readonly payloadJson?: unknown;
  readonly bytes?: number;
  readonly truncated?: boolean;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly retentionExpiresAt?: string;
}

export interface TelemetryArtifactWrite extends TelemetryArtifactAttachment {
  readonly traceId: string;
  readonly spanId: string;
  readonly runId: string;
  readonly workflowId: string;
  readonly nodeId?: string;
  readonly activationId?: string;
  readonly retentionExpiresAt?: string;
}

export interface TelemetryMetricPointRecord {
  readonly metricPointId: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly runId?: string;
  readonly workflowId: string;
  readonly nodeId?: string;
  readonly activationId?: string;
  readonly metricName: string;
  readonly value: number;
  readonly unit?: string;
  readonly observedAt: string;
  readonly workflowFolder?: string;
  readonly nodeType?: string;
  readonly nodeRole?: string;
  readonly modelName?: string;
  readonly dimensions?: TelemetryAttributes;
  readonly retentionExpiresAt?: string;
}

export interface TelemetryMetricPointWrite extends TelemetryMetricRecord {
  readonly traceId?: string;
  readonly spanId?: string;
  readonly runId?: string;
  readonly workflowId: string;
  readonly nodeId?: string;
  readonly activationId?: string;
  readonly observedAt: string;
  readonly workflowFolder?: string;
  readonly nodeType?: string;
  readonly nodeRole?: string;
  readonly modelName?: string;
  readonly retentionExpiresAt?: string;
}

export interface TelemetrySpanListQuery {
  readonly traceId?: string;
  readonly runId?: string;
  readonly runIds?: ReadonlyArray<string>;
  readonly workflowId?: string;
  readonly workflowIds?: ReadonlyArray<string>;
  readonly statuses?: ReadonlyArray<TelemetrySpanStatus>;
  readonly names?: ReadonlyArray<string>;
  readonly modelNames?: ReadonlyArray<string>;
  readonly startTimeGte?: string;
  readonly endTimeLte?: string;
  readonly limit?: number;
}

export interface TelemetryMetricPointListQuery {
  readonly traceId?: string;
  readonly runId?: string;
  readonly runIds?: ReadonlyArray<string>;
  readonly workflowId?: string;
  readonly workflowIds?: ReadonlyArray<string>;
  readonly nodeId?: string;
  readonly metricNames?: ReadonlyArray<string>;
  readonly modelNames?: ReadonlyArray<string>;
  readonly observedAtGte?: string;
  readonly observedAtLte?: string;
  readonly limit?: number;
}

export interface TelemetryPruneArgs {
  readonly nowIso: string;
  readonly limit?: number;
}

export interface RunTraceContextRepository {
  load(runId: string): Promise<TelemetryTraceContext | undefined>;
  getOrCreate(
    args: Readonly<{ runId: string; workflowId: string; serviceName?: string }>,
  ): Promise<TelemetryTraceContext>;
  upsertExpiry(args: Readonly<{ runId: string; expiresAt?: string }>): Promise<void>;
}

export interface TelemetrySpanStore {
  upsert(record: TelemetrySpanUpsert): Promise<void>;
  list(args?: TelemetrySpanListQuery): Promise<ReadonlyArray<TelemetrySpanRecord>>;
  listByTraceId(traceId: string): Promise<ReadonlyArray<TelemetrySpanRecord>>;
  pruneExpired(args: TelemetryPruneArgs): Promise<number>;
}

export interface TelemetryArtifactStore {
  save(record: TelemetryArtifactWrite): Promise<TelemetryArtifactRecord>;
  listByTraceId(traceId: string): Promise<ReadonlyArray<TelemetryArtifactRecord>>;
  pruneExpired(args: TelemetryPruneArgs): Promise<number>;
}

export interface TelemetryMetricPointStore {
  save(record: TelemetryMetricPointWrite): Promise<TelemetryMetricPointRecord>;
  list(args?: TelemetryMetricPointListQuery): Promise<ReadonlyArray<TelemetryMetricPointRecord>>;
  pruneExpired(args: TelemetryPruneArgs): Promise<number>;
}

export interface TelemetryExporter {
  exportSpans(spans: ReadonlyArray<TelemetrySpanRecord>): Promise<void>;
}
