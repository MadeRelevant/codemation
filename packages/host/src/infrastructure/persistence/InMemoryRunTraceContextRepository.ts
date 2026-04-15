import { inject, injectable } from "@codemation/core";
import { OtelIdentityFactory } from "../../application/telemetry/OtelIdentityFactory";
import type { RunTraceContextRepository, TelemetryTraceContext } from "../../domain/telemetry/TelemetryContracts";

@injectable()
export class InMemoryRunTraceContextRepository implements RunTraceContextRepository {
  private readonly rows = new Map<string, TelemetryTraceContext>();

  constructor(@inject(OtelIdentityFactory) private readonly otelIdentityFactory: OtelIdentityFactory) {}

  async load(runId: string): Promise<TelemetryTraceContext | undefined> {
    return this.rows.get(decodeURIComponent(runId));
  }

  async getOrCreate(
    args: Readonly<{ runId: string; workflowId: string; serviceName?: string }>,
  ): Promise<TelemetryTraceContext> {
    const key = decodeURIComponent(args.runId);
    const existing = this.rows.get(key);
    if (existing) {
      return existing;
    }
    const created: TelemetryTraceContext = {
      runId: key,
      workflowId: decodeURIComponent(args.workflowId),
      traceId: this.otelIdentityFactory.createTraceId(key),
      rootSpanId: this.otelIdentityFactory.createRootSpanId(key),
      serviceName: args.serviceName,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(key, created);
    return created;
  }

  async upsertExpiry(args: Readonly<{ runId: string; expiresAt?: string }>): Promise<void> {
    const key = decodeURIComponent(args.runId);
    const existing = this.rows.get(key);
    if (!existing) {
      return;
    }
    this.rows.set(key, {
      ...existing,
      expiresAt: this.resolveLaterExpiry(existing.expiresAt, args.expiresAt),
    });
  }

  private resolveLaterExpiry(current: string | undefined, candidate: string | undefined): string | undefined {
    if (!current) {
      return candidate;
    }
    if (!candidate) {
      return current;
    }
    return current >= candidate ? current : candidate;
  }
}
