import { inject, injectable, type TelemetryAttributes, type TelemetrySpanEventRecord } from "@codemation/core";
import type {
  TelemetrySpanListQuery,
  TelemetrySpanRecord,
  TelemetrySpanStore,
  TelemetrySpanUpsert,
} from "../../domain/telemetry/TelemetryContracts";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

@injectable()
export class PrismaTelemetrySpanStore implements TelemetrySpanStore {
  constructor(
    @inject(PrismaDatabaseClientToken)
    private readonly prisma: PrismaDatabaseClient,
  ) {}

  async upsert(record: TelemetrySpanUpsert): Promise<void> {
    const telemetrySpanId = this.createTelemetrySpanId(record.traceId, record.spanId);
    const existing = await this.prisma.telemetrySpan.findUnique({
      where: { telemetrySpanId },
    });
    const attributes = this.mergeAttributes(
      this.parseJson<TelemetryAttributes>(existing?.attributesJson ?? null),
      record.attributes,
    );
    const events = this.mergeEvents(
      this.parseJson<ReadonlyArray<TelemetrySpanEventRecord>>(existing?.eventsJson ?? null),
      record.events,
    );
    const data = {
      traceId: record.traceId,
      spanId: record.spanId,
      parentSpanId: record.parentSpanId ?? existing?.parentSpanId ?? null,
      runId: record.runId,
      workflowId: record.workflowId,
      nodeId: record.nodeId ?? existing?.nodeId ?? null,
      activationId: record.activationId ?? existing?.activationId ?? null,
      connectionInvocationId: record.connectionInvocationId ?? existing?.connectionInvocationId ?? null,
      name: record.name ?? existing?.name ?? "codemation.span",
      kind: record.kind ?? existing?.kind ?? "internal",
      status: record.status ?? existing?.status ?? null,
      statusMessage: record.statusMessage ?? existing?.statusMessage ?? null,
      startTime: record.startTime ?? existing?.startTime ?? null,
      endTime: record.endTime ?? existing?.endTime ?? null,
      workflowFolder: record.workflowFolder ?? existing?.workflowFolder ?? null,
      nodeType: record.nodeType ?? existing?.nodeType ?? null,
      nodeRole: record.nodeRole ?? existing?.nodeRole ?? null,
      modelName: record.modelName ?? existing?.modelName ?? null,
      attributesJson: attributes ? JSON.stringify(attributes) : null,
      eventsJson: events.length > 0 ? JSON.stringify(events) : null,
      retentionExpiresAt: record.retentionExpiresAt ?? existing?.retentionExpiresAt ?? null,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.telemetrySpan.upsert({
      where: { telemetrySpanId },
      create: {
        telemetrySpanId,
        ...data,
      },
      update: data,
    });
  }

  async list(args: TelemetrySpanListQuery = {}): Promise<ReadonlyArray<TelemetrySpanRecord>> {
    const rows = await this.prisma.telemetrySpan.findMany({
      where: {
        ...(args.traceId ? { traceId: args.traceId } : {}),
        ...(args.runId ? { runId: args.runId } : {}),
        ...(args.runIds && args.runIds.length > 0 ? { runId: { in: [...args.runIds] } } : {}),
        ...(args.workflowId ? { workflowId: args.workflowId } : {}),
        ...(args.statuses && args.statuses.length > 0 ? { status: { in: [...args.statuses] } } : {}),
        ...(args.names && args.names.length > 0 ? { name: { in: [...args.names] } } : {}),
        ...(args.modelNames && args.modelNames.length > 0 ? { modelName: { in: [...args.modelNames] } } : {}),
        ...(args.startTimeGte ? { startTime: { gte: args.startTimeGte } } : {}),
        ...(args.endTimeLte ? { endTime: { lte: args.endTimeLte } } : {}),
      },
      orderBy: [{ startTime: "asc" }, { spanId: "asc" }],
      ...(args.limit ? { take: args.limit } : {}),
    });
    return rows.map((row) => ({
      traceId: row.traceId,
      spanId: row.spanId,
      parentSpanId: row.parentSpanId ?? undefined,
      runId: row.runId,
      workflowId: row.workflowId,
      nodeId: row.nodeId ?? undefined,
      activationId: row.activationId ?? undefined,
      connectionInvocationId: row.connectionInvocationId ?? undefined,
      name: row.name,
      kind: row.kind as TelemetrySpanRecord["kind"],
      status: row.status ? (row.status as TelemetrySpanRecord["status"]) : undefined,
      statusMessage: row.statusMessage ?? undefined,
      startTime: row.startTime ?? undefined,
      endTime: row.endTime ?? undefined,
      workflowFolder: row.workflowFolder ?? undefined,
      nodeType: row.nodeType ?? undefined,
      nodeRole: row.nodeRole ?? undefined,
      modelName: row.modelName ?? undefined,
      attributes: this.parseJson<TelemetryAttributes>(row.attributesJson),
      events: this.parseJson<ReadonlyArray<TelemetrySpanEventRecord>>(row.eventsJson) ?? [],
      retentionExpiresAt: row.retentionExpiresAt ?? undefined,
    }));
  }

  async listByTraceId(traceId: string): Promise<ReadonlyArray<TelemetrySpanRecord>> {
    return await this.list({ traceId });
  }

  async pruneExpired(args: Readonly<{ nowIso: string; limit?: number }>): Promise<number> {
    const rows = await this.prisma.telemetrySpan.findMany({
      where: {
        retentionExpiresAt: {
          lte: args.nowIso,
        },
      },
      select: {
        telemetrySpanId: true,
      },
      orderBy: [{ retentionExpiresAt: "asc" }, { telemetrySpanId: "asc" }],
      ...(args.limit ? { take: args.limit } : {}),
    });
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.telemetrySpan.deleteMany({
      where: {
        telemetrySpanId: {
          in: rows.map((row) => row.telemetrySpanId),
        },
      },
    });
    return result.count;
  }

  private createTelemetrySpanId(traceId: string, spanId: string): string {
    return `${traceId}:${spanId}`;
  }

  private parseJson<T>(value: string | null): T | undefined {
    if (!value) {
      return undefined;
    }
    return JSON.parse(value) as T;
  }

  private mergeAttributes(
    existing: TelemetryAttributes | undefined,
    update: TelemetryAttributes | undefined,
  ): TelemetryAttributes | undefined {
    if (!existing && !update) {
      return undefined;
    }
    return {
      ...(existing ?? {}),
      ...(update ?? {}),
    };
  }

  private mergeEvents(
    existing: ReadonlyArray<TelemetrySpanEventRecord> | undefined,
    update: ReadonlyArray<TelemetrySpanEventRecord> | undefined,
  ): Array<TelemetrySpanEventRecord> {
    return [...(existing ?? []), ...(update ?? [])];
  }
}
