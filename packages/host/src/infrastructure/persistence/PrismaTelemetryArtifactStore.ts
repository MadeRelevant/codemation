import type { BinaryBody, BinaryStorage } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import { OtelIdentityFactory } from "../../application/telemetry/OtelIdentityFactory";
import type {
  TelemetryArtifactRecord,
  TelemetryArtifactStore,
  TelemetryArtifactWrite,
  TelemetryPruneArgs,
} from "../../domain/telemetry/TelemetryContracts";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

/** Payloads larger than this byte threshold are offloaded to BinaryStorage. */
const PAYLOAD_OFFLOAD_THRESHOLD_BYTES = 64_000;

@injectable()
export class PrismaTelemetryArtifactStore implements TelemetryArtifactStore {
  constructor(
    @inject(PrismaDatabaseClientToken)
    private readonly prisma: PrismaDatabaseClient,
    @inject(OtelIdentityFactory)
    private readonly otelIdentityFactory: OtelIdentityFactory,
    @inject(CoreTokens.BinaryStorage)
    private readonly binaryStorage: BinaryStorage,
  ) {}

  async save(record: TelemetryArtifactWrite): Promise<TelemetryArtifactRecord> {
    const artifactId = this.otelIdentityFactory.createArtifactId();
    const createdAt = new Date().toISOString();

    // Resolve inline vs offloaded payload
    let payloadText: string | null = record.payloadText ?? null;
    let payloadJson: string | null = record.payloadJson !== undefined ? JSON.stringify(record.payloadJson) : null;
    let payloadStorageKey: string | null = null;

    const payloadTextBytes = payloadText ? Buffer.byteLength(payloadText, "utf8") : 0;
    const payloadJsonBytes = payloadJson ? Buffer.byteLength(payloadJson, "utf8") : 0;

    if (payloadTextBytes > PAYLOAD_OFFLOAD_THRESHOLD_BYTES) {
      const storageKey = `telemetry-artifacts/${artifactId}.txt`;
      const body: BinaryBody = Buffer.from(payloadText!, "utf8");
      await this.binaryStorage.write({ storageKey, body });
      payloadStorageKey = storageKey;
      payloadText = null;
    } else if (payloadJsonBytes > PAYLOAD_OFFLOAD_THRESHOLD_BYTES) {
      const storageKey = `telemetry-artifacts/${artifactId}.json`;
      const body: BinaryBody = Buffer.from(payloadJson!, "utf8");
      await this.binaryStorage.write({ storageKey, body });
      payloadStorageKey = storageKey;
      payloadJson = null;
    }

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
        payloadText,
        payloadJson,
        payloadStorageKey,
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
      payloadText: payloadText ?? undefined,
      payloadJson: payloadJson !== null ? JSON.parse(payloadJson) : undefined,
      payloadStorageKey: payloadStorageKey ?? undefined,
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
      payloadStorageKey: row.payloadStorageKey ?? undefined,
      bytes: row.bytes ?? undefined,
      truncated: row.truncated ?? undefined,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? undefined,
      retentionExpiresAt: row.retentionExpiresAt ?? undefined,
    }));
  }

  async pruneExpired(args: TelemetryPruneArgs): Promise<{ count: number; storageKeys: ReadonlyArray<string> }> {
    const rows = await this.prisma.telemetryArtifact.findMany({
      where: {
        retentionExpiresAt: {
          lte: args.nowIso,
        },
      },
      select: {
        artifactId: true,
        payloadStorageKey: true,
      },
      orderBy: [{ retentionExpiresAt: "asc" }, { artifactId: "asc" }],
      ...(args.limit ? { take: args.limit } : {}),
    });
    if (rows.length === 0) {
      return { count: 0, storageKeys: [] };
    }
    const storageKeys = rows.flatMap((row) => (row.payloadStorageKey ? [row.payloadStorageKey] : []));
    const result = await this.prisma.telemetryArtifact.deleteMany({
      where: {
        artifactId: {
          in: rows.map((row) => row.artifactId),
        },
      },
    });
    return { count: result.count, storageKeys };
  }

  private parseJson(value: string | null): unknown {
    if (!value) {
      return undefined;
    }
    return JSON.parse(value);
  }
}
