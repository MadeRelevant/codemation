import { inject, injectable } from "@codemation/core";
import { OtelIdentityFactory } from "../../application/telemetry/OtelIdentityFactory";
import type {
  TelemetryMetricPointListQuery,
  TelemetryMetricPointRecord,
  TelemetryMetricPointStore,
  TelemetryMetricPointWrite,
} from "../../domain/telemetry/TelemetryContracts";

@injectable()
export class InMemoryTelemetryMetricPointStore implements TelemetryMetricPointStore {
  private readonly rows = new Map<string, TelemetryMetricPointRecord>();

  constructor(@inject(OtelIdentityFactory) private readonly otelIdentityFactory: OtelIdentityFactory) {}

  async save(record: TelemetryMetricPointWrite): Promise<TelemetryMetricPointRecord> {
    const created: TelemetryMetricPointRecord = {
      metricPointId: this.otelIdentityFactory.createArtifactId(),
      traceId: record.traceId,
      spanId: record.spanId,
      runId: record.runId,
      workflowId: record.workflowId,
      nodeId: record.nodeId,
      activationId: record.activationId,
      metricName: record.name,
      value: record.value,
      unit: record.unit,
      observedAt: record.observedAt,
      workflowFolder: record.workflowFolder,
      nodeType: record.nodeType,
      nodeRole: record.nodeRole,
      modelName: record.modelName,
      dimensions: record.attributes,
      retentionExpiresAt: record.retentionExpiresAt,
    };
    this.rows.set(created.metricPointId, created);
    return created;
  }

  async list(args: TelemetryMetricPointListQuery = {}): Promise<ReadonlyArray<TelemetryMetricPointRecord>> {
    return [...this.rows.values()]
      .filter((row) => this.matches(row, args))
      .sort((left, right) => {
        const observedCompare = left.observedAt.localeCompare(right.observedAt);
        if (observedCompare !== 0) {
          return observedCompare;
        }
        return left.metricPointId.localeCompare(right.metricPointId);
      })
      .slice(0, args.limit ?? Number.MAX_SAFE_INTEGER);
  }

  async pruneExpired(args: Readonly<{ nowIso: string; limit?: number }>): Promise<number> {
    const candidates = [...this.rows.entries()]
      .filter(([, row]) => row.retentionExpiresAt !== undefined && row.retentionExpiresAt <= args.nowIso)
      .sort((left, right) => (left[1].retentionExpiresAt ?? "").localeCompare(right[1].retentionExpiresAt ?? ""))
      .slice(0, args.limit ?? Number.MAX_SAFE_INTEGER);
    for (const [key] of candidates) {
      this.rows.delete(key);
    }
    return candidates.length;
  }

  private matches(row: TelemetryMetricPointRecord, args: TelemetryMetricPointListQuery): boolean {
    if (args.traceId && row.traceId !== args.traceId) {
      return false;
    }
    if (args.runId && row.runId !== args.runId) {
      return false;
    }
    if (args.runIds && args.runIds.length > 0 && (!row.runId || !args.runIds.includes(row.runId))) {
      return false;
    }
    if (args.workflowId && row.workflowId !== args.workflowId) {
      return false;
    }
    if (args.nodeId && row.nodeId !== args.nodeId) {
      return false;
    }
    if (args.metricNames && args.metricNames.length > 0 && !args.metricNames.includes(row.metricName)) {
      return false;
    }
    if (args.modelNames && args.modelNames.length > 0 && (!row.modelName || !args.modelNames.includes(row.modelName))) {
      return false;
    }
    if (args.observedAtGte && row.observedAt < args.observedAtGte) {
      return false;
    }
    if (args.observedAtLte && row.observedAt > args.observedAtLte) {
      return false;
    }
    return true;
  }
}
