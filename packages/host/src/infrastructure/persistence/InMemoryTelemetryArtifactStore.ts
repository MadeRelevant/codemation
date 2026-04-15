import { inject, injectable } from "@codemation/core";
import { OtelIdentityFactory } from "../../application/telemetry/OtelIdentityFactory";
import type {
  TelemetryArtifactRecord,
  TelemetryArtifactStore,
  TelemetryArtifactWrite,
} from "../../domain/telemetry/TelemetryContracts";

@injectable()
export class InMemoryTelemetryArtifactStore implements TelemetryArtifactStore {
  private readonly rows = new Map<string, TelemetryArtifactRecord>();

  constructor(@inject(OtelIdentityFactory) private readonly otelIdentityFactory: OtelIdentityFactory) {}

  async save(record: TelemetryArtifactWrite): Promise<TelemetryArtifactRecord> {
    const created: TelemetryArtifactRecord = {
      artifactId: this.otelIdentityFactory.createArtifactId(),
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
      createdAt: new Date().toISOString(),
      expiresAt: record.expiresAt?.toISOString(),
      retentionExpiresAt: record.retentionExpiresAt,
    };
    this.rows.set(created.artifactId, created);
    return created;
  }

  async listByTraceId(traceId: string): Promise<ReadonlyArray<TelemetryArtifactRecord>> {
    return [...this.rows.values()]
      .filter((row) => row.traceId === traceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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
