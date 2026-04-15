import { inject, injectable } from "@codemation/core";
import { OtelIdentityFactory } from "../../application/telemetry/OtelIdentityFactory";
import type {
  TelemetryArtifactRecord,
  TelemetryArtifactStore,
  TelemetryArtifactWrite,
} from "../../domain/telemetry/TelemetryContracts";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

@injectable()
export class PrismaTelemetryArtifactStore implements TelemetryArtifactStore {
  constructor(
    @inject(PrismaDatabaseClientToken)
    private readonly prisma: PrismaDatabaseClient,
    @inject(OtelIdentityFactory)
    private readonly otelIdentityFactory: OtelIdentityFactory,
  ) {}

  async save(record: TelemetryArtifactWrite): Promise<TelemetryArtifactRecord> {
    const artifactId = this.otelIdentityFactory.createArtifactId();
    const createdAt = new Date().toISOString();
    await this.prisma.telemetryArtifact.create({
      data: {
        artifactId,
        traceId: record.traceId,
        spanId: record.spanId,
        runId: record.runId,
        workflowId: record.workflowId,
        nodeId: record.nodeId ?? null,
        activationId: record.activationId ?? null,
        kind: record.kind,
        contentType: record.contentType,
        previewText: record.previewText ?? null,
        previewJson: record.previewJson !== undefined ? JSON.stringify(record.previewJson) : null,
        payloadText: record.payloadText ?? null,
        payloadJson: record.payloadJson !== undefined ? JSON.stringify(record.payloadJson) : null,
        bytes: record.bytes ?? null,
        truncated: record.truncated ?? null,
        createdAt,
        expiresAt: record.expiresAt?.toISOString() ?? null,
        retentionExpiresAt: record.retentionExpiresAt ?? null,
      },
    });
    return {
      artifactId,
      traceId: record.traceId,
      spanId: record.spanId,
      runId: record.runId,
      workflowId: record.workflowId,
      nodeId: record.nodeId,
      activationId: record.activationId,
      kind: record.kind,
      contentType: record.contentType,
      previewText: record.previewText,
      previewJson: record.previewJson,
      payloadText: record.payloadText,
      payloadJson: record.payloadJson,
      bytes: record.bytes,
      truncated: record.truncated,
      createdAt,
      expiresAt: record.expiresAt?.toISOString(),
      retentionExpiresAt: record.retentionExpiresAt,
    };
  }

  async listByTraceId(traceId: string): Promise<ReadonlyArray<TelemetryArtifactRecord>> {
    const rows = await this.prisma.telemetryArtifact.findMany({
      where: { traceId },
      orderBy: [{ createdAt: "asc" }, { artifactId: "asc" }],
    });
    return rows.map((row) => ({
      artifactId: row.artifactId,
      traceId: row.traceId,
      spanId: row.spanId,
      runId: row.runId,
      workflowId: row.workflowId,
      nodeId: row.nodeId ?? undefined,
      activationId: row.activationId ?? undefined,
      kind: row.kind,
      contentType: row.contentType,
      previewText: row.previewText ?? undefined,
      previewJson: this.parseJson(row.previewJson),
      payloadText: row.payloadText ?? undefined,
      payloadJson: this.parseJson(row.payloadJson),
      bytes: row.bytes ?? undefined,
      truncated: row.truncated ?? undefined,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? undefined,
      retentionExpiresAt: row.retentionExpiresAt ?? undefined,
    }));
  }

  async pruneExpired(args: Readonly<{ nowIso: string; limit?: number }>): Promise<number> {
    const rows = await this.prisma.telemetryArtifact.findMany({
      where: {
        retentionExpiresAt: {
          lte: args.nowIso,
        },
      },
      select: {
        artifactId: true,
      },
      orderBy: [{ retentionExpiresAt: "asc" }, { artifactId: "asc" }],
      ...(args.limit ? { take: args.limit } : {}),
    });
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.telemetryArtifact.deleteMany({
      where: {
        artifactId: {
          in: rows.map((row) => row.artifactId),
        },
      },
    });
    return result.count;
  }

  private parseJson(value: string | null): unknown {
    if (!value) {
      return undefined;
    }
    return JSON.parse(value);
  }
}
