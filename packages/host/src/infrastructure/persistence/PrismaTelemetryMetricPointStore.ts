import { inject, injectable, type TelemetryAttributes } from "@codemation/core";
import { OtelIdentityFactory } from "../../application/telemetry/OtelIdentityFactory";
import type {
  TelemetryMetricPointListQuery,
  TelemetryMetricPointRecord,
  TelemetryMetricPointStore,
  TelemetryMetricPointWrite,
} from "../../domain/telemetry/TelemetryContracts";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

@injectable()
export class PrismaTelemetryMetricPointStore implements TelemetryMetricPointStore {
  constructor(
    @inject(PrismaDatabaseClientToken)
    private readonly prisma: PrismaDatabaseClient,
    @inject(OtelIdentityFactory)
    private readonly otelIdentityFactory: OtelIdentityFactory,
  ) {}

  async save(record: TelemetryMetricPointWrite): Promise<TelemetryMetricPointRecord> {
    const metricPointId = this.otelIdentityFactory.createArtifactId();
    await this.prisma.telemetryMetricPoint.create({
      data: {
        metricPointId,
        traceId: record.traceId ?? null,
        spanId: record.spanId ?? null,
        runId: record.runId ?? null,
        workflowId: record.workflowId,
        nodeId: record.nodeId ?? null,
        activationId: record.activationId ?? null,
        metricName: record.name,
        value: record.value,
        unit: record.unit ?? null,
        observedAt: record.observedAt,
        workflowFolder: record.workflowFolder ?? null,
        nodeType: record.nodeType ?? null,
        nodeRole: record.nodeRole ?? null,
        modelName: record.modelName ?? null,
        dimensionsJson: record.attributes ? JSON.stringify(record.attributes) : null,
        retentionExpiresAt: record.retentionExpiresAt ?? null,
        iterationId: record.iterationId ?? null,
        itemIndex: record.itemIndex ?? null,
        parentInvocationId: record.parentInvocationId ?? null,
      },
    });
    return {
      metricPointId,
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
      iterationId: record.iterationId,
      itemIndex: record.itemIndex,
      parentInvocationId: record.parentInvocationId,
    };
  }

  async list(args: TelemetryMetricPointListQuery = {}): Promise<ReadonlyArray<TelemetryMetricPointRecord>> {
    const rows = await this.prisma.telemetryMetricPoint.findMany({
      where: {
        ...(args.traceId ? { traceId: args.traceId } : {}),
        ...(args.runId ? { runId: args.runId } : {}),
        ...(args.runIds && args.runIds.length > 0 ? { runId: { in: [...args.runIds] } } : {}),
        ...(args.workflowId ? { workflowId: args.workflowId } : {}),
        ...(args.workflowIds && args.workflowIds.length > 0 ? { workflowId: { in: [...args.workflowIds] } } : {}),
        ...(args.nodeId ? { nodeId: args.nodeId } : {}),
        ...(args.metricNames && args.metricNames.length > 0 ? { metricName: { in: [...args.metricNames] } } : {}),
        ...(args.modelNames && args.modelNames.length > 0 ? { modelName: { in: [...args.modelNames] } } : {}),
        ...(args.observedAtGte ? { observedAt: { gte: args.observedAtGte } } : {}),
        ...(args.observedAtLte ? { observedAt: { lte: args.observedAtLte } } : {}),
      },
      orderBy: [{ observedAt: "asc" }, { metricPointId: "asc" }],
      ...(args.limit ? { take: args.limit } : {}),
    });
    return rows.map((row) => ({
      metricPointId: row.metricPointId,
      traceId: row.traceId ?? undefined,
      spanId: row.spanId ?? undefined,
      runId: row.runId ?? undefined,
      workflowId: row.workflowId,
      nodeId: row.nodeId ?? undefined,
      activationId: row.activationId ?? undefined,
      metricName: row.metricName,
      value: row.value,
      unit: row.unit ?? undefined,
      observedAt: row.observedAt,
      workflowFolder: row.workflowFolder ?? undefined,
      nodeType: row.nodeType ?? undefined,
      nodeRole: row.nodeRole ?? undefined,
      modelName: row.modelName ?? undefined,
      dimensions: this.parseJson<TelemetryAttributes>(row.dimensionsJson),
      retentionExpiresAt: row.retentionExpiresAt ?? undefined,
      iterationId: row.iterationId ?? undefined,
      itemIndex: row.itemIndex ?? undefined,
      parentInvocationId: row.parentInvocationId ?? undefined,
    }));
  }

  async pruneExpired(args: Readonly<{ nowIso: string; limit?: number }>): Promise<number> {
    const rows = await this.prisma.telemetryMetricPoint.findMany({
      where: {
        retentionExpiresAt: {
          lte: args.nowIso,
        },
      },
      select: {
        metricPointId: true,
      },
      orderBy: [{ retentionExpiresAt: "asc" }, { metricPointId: "asc" }],
      ...(args.limit ? { take: args.limit } : {}),
    });
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.telemetryMetricPoint.deleteMany({
      where: {
        metricPointId: {
          in: rows.map((row) => row.metricPointId),
        },
      },
    });
    return result.count;
  }

  private parseJson<T>(value: string | null): T | undefined {
    if (!value) {
      return undefined;
    }
    return JSON.parse(value) as T;
  }
}
