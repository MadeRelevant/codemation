import { inject, injectable } from "@codemation/core";
import { OtelIdentityFactory } from "../../application/telemetry/OtelIdentityFactory";
import type { RunTraceContextRepository, TelemetryTraceContext } from "../../domain/telemetry/TelemetryContracts";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

@injectable()
export class PrismaRunTraceContextRepository implements RunTraceContextRepository {
  constructor(
    @inject(PrismaDatabaseClientToken)
    private readonly prisma: PrismaDatabaseClient,
    @inject(OtelIdentityFactory)
    private readonly otelIdentityFactory: OtelIdentityFactory,
  ) {}

  async load(runId: string): Promise<TelemetryTraceContext | undefined> {
    const row = await this.prisma.runTraceContext.findUnique({
      where: { runId: decodeURIComponent(runId) },
    });
    if (!row) {
      return undefined;
    }
    return {
      runId: row.runId,
      workflowId: row.workflowId,
      traceId: row.traceId,
      rootSpanId: row.rootSpanId,
      serviceName: row.serviceName ?? undefined,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? undefined,
    };
  }

  async getOrCreate(
    args: Readonly<{ runId: string; workflowId: string; serviceName?: string }>,
  ): Promise<TelemetryTraceContext> {
    const existing = await this.load(args.runId);
    if (existing) {
      return existing;
    }
    const created: TelemetryTraceContext = {
      runId: decodeURIComponent(args.runId),
      workflowId: decodeURIComponent(args.workflowId),
      traceId: this.otelIdentityFactory.createTraceId(args.runId),
      rootSpanId: this.otelIdentityFactory.createRootSpanId(args.runId),
      serviceName: args.serviceName,
      createdAt: new Date().toISOString(),
    };
    await this.prisma.runTraceContext.create({
      data: {
        runId: created.runId,
        workflowId: created.workflowId,
        traceId: created.traceId,
        rootSpanId: created.rootSpanId,
        serviceName: created.serviceName ?? null,
        createdAt: created.createdAt,
        expiresAt: null,
      },
    });
    return created;
  }

  async upsertExpiry(args: Readonly<{ runId: string; expiresAt?: string }>): Promise<void> {
    if (!args.expiresAt) {
      return;
    }
    const runId = decodeURIComponent(args.runId);
    const existing = await this.prisma.runTraceContext.findUnique({
      where: { runId },
      select: { expiresAt: true },
    });
    if (!existing) {
      return;
    }
    const expiresAt = this.resolveLaterExpiry(existing.expiresAt ?? undefined, args.expiresAt);
    await this.prisma.runTraceContext.update({
      where: { runId },
      data: {
        expiresAt: expiresAt ?? null,
      },
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
