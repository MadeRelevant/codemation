import { injectable } from "@codemation/core";
import type {
  TelemetrySpanListQuery,
  TelemetrySpanRecord,
  TelemetrySpanStore,
  TelemetrySpanUpsert,
} from "../../domain/telemetry/TelemetryContracts";

@injectable()
export class InMemoryTelemetrySpanStore implements TelemetrySpanStore {
  private readonly rows = new Map<string, TelemetrySpanRecord>();

  async upsert(record: TelemetrySpanUpsert): Promise<void> {
    const key = this.createKey(record.traceId, record.spanId);
    const existing = this.rows.get(key);
    this.rows.set(key, this.merge(existing, record));
  }

  async list(args: TelemetrySpanListQuery = {}): Promise<ReadonlyArray<TelemetrySpanRecord>> {
    return [...this.rows.values()]
      .filter((row) => this.matches(row, args))
      .sort((left, right) => {
        const startCompare = (left.startTime ?? "").localeCompare(right.startTime ?? "");
        if (startCompare !== 0) {
          return startCompare;
        }
        return left.spanId.localeCompare(right.spanId);
      })
      .slice(0, args.limit ?? Number.MAX_SAFE_INTEGER);
  }

  async listByTraceId(traceId: string): Promise<ReadonlyArray<TelemetrySpanRecord>> {
    return await this.list({ traceId });
  }

  private createKey(traceId: string, spanId: string): string {
    return `${traceId}:${spanId}`;
  }

  private merge(existing: TelemetrySpanRecord | undefined, update: TelemetrySpanUpsert): TelemetrySpanRecord {
    return {
      traceId: update.traceId,
      spanId: update.spanId,
      parentSpanId: update.parentSpanId ?? existing?.parentSpanId,
      runId: update.runId,
      workflowId: update.workflowId,
      nodeId: update.nodeId ?? existing?.nodeId,
      activationId: update.activationId ?? existing?.activationId,
      connectionInvocationId: update.connectionInvocationId ?? existing?.connectionInvocationId,
      name: update.name ?? existing?.name ?? "codemation.span",
      kind: update.kind ?? existing?.kind ?? "internal",
      status: update.status ?? existing?.status,
      statusMessage: update.statusMessage ?? existing?.statusMessage,
      startTime: update.startTime ?? existing?.startTime,
      endTime: update.endTime ?? existing?.endTime,
      workflowFolder: update.workflowFolder ?? existing?.workflowFolder,
      nodeType: update.nodeType ?? existing?.nodeType,
      nodeRole: update.nodeRole ?? existing?.nodeRole,
      modelName: update.modelName ?? existing?.modelName,
      attributes: {
        ...(existing?.attributes ?? {}),
        ...(update.attributes ?? {}),
      },
      events: [...(existing?.events ?? []), ...(update.events ?? [])],
      retentionExpiresAt: update.retentionExpiresAt ?? existing?.retentionExpiresAt,
    };
  }

  private matches(row: TelemetrySpanRecord, args: TelemetrySpanListQuery): boolean {
    if (args.traceId && row.traceId !== args.traceId) {
      return false;
    }
    if (args.runId && row.runId !== args.runId) {
      return false;
    }
    if (args.runIds && args.runIds.length > 0 && !args.runIds.includes(row.runId)) {
      return false;
    }
    if (args.workflowId && row.workflowId !== args.workflowId) {
      return false;
    }
    if (args.statuses && args.statuses.length > 0 && (!row.status || !args.statuses.includes(row.status))) {
      return false;
    }
    if (args.names && args.names.length > 0 && !args.names.includes(row.name)) {
      return false;
    }
    if (args.modelNames && args.modelNames.length > 0 && (!row.modelName || !args.modelNames.includes(row.modelName))) {
      return false;
    }
    if (args.startTimeGte && row.startTime && row.startTime < args.startTimeGte) {
      return false;
    }
    if (args.endTimeLte && row.endTime && row.endTime > args.endTimeLte) {
      return false;
    }
    return true;
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
}
