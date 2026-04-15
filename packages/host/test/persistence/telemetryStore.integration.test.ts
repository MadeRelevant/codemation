// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OtelIdentityFactory } from "../../src/application/telemetry/OtelIdentityFactory";
import type { PrismaDatabaseClient as PrismaClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";
import { PrismaRunTraceContextRepository } from "../../src/infrastructure/persistence/PrismaRunTraceContextRepository";
import { PrismaTelemetryArtifactStore } from "../../src/infrastructure/persistence/PrismaTelemetryArtifactStore";
import { PrismaTelemetryMetricPointStore } from "../../src/infrastructure/persistence/PrismaTelemetryMetricPointStore";
import { PrismaTelemetrySpanStore } from "../../src/infrastructure/persistence/PrismaTelemetrySpanStore";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";

class TelemetryStoreIntegrationContext {
  private readonly session = new IntegrationTestDatabaseSession();
  private readonly otelIdentityFactory = new OtelIdentityFactory();

  async start(): Promise<void> {
    await this.session.start();
  }

  async stop(): Promise<void> {
    await this.session.dispose();
  }

  createTraceContextRepository(): PrismaRunTraceContextRepository {
    return new PrismaRunTraceContextRepository(this.requirePrismaClient(), this.otelIdentityFactory);
  }

  createSpanStore(): PrismaTelemetrySpanStore {
    return new PrismaTelemetrySpanStore(this.requirePrismaClient());
  }

  createArtifactStore(): PrismaTelemetryArtifactStore {
    return new PrismaTelemetryArtifactStore(this.requirePrismaClient(), this.otelIdentityFactory);
  }

  createMetricPointStore(): PrismaTelemetryMetricPointStore {
    return new PrismaTelemetryMetricPointStore(this.requirePrismaClient(), this.otelIdentityFactory);
  }

  async seedRun(runId: string, workflowId: string): Promise<void> {
    await this.requirePrismaClient().run.create({
      data: {
        runId,
        workflowId,
        startedAt: "2026-04-14T00:00:00.000Z",
        status: "completed",
        outputsByNodeJson: "{}",
        updatedAt: "2026-04-14T00:00:00.000Z",
      },
    });
  }

  async deleteRun(runId: string): Promise<void> {
    await this.requirePrismaClient().run.delete({
      where: { runId },
    });
  }

  private requirePrismaClient(): PrismaClient {
    if (!this.session.transaction) {
      throw new Error("TelemetryStoreIntegrationContext.start() must be called before using Prisma.");
    }
    return this.session.transaction.getPrismaClient();
  }
}

describe("telemetry persistence", () => {
  const context = new TelemetryStoreIntegrationContext();

  beforeAll(async () => {
    await context.start();
  });

  afterAll(async () => {
    await context.stop();
  });

  it("persists trace context, spans, artifacts, and supports indexed time-range filters", async () => {
    await context.seedRun("run_telemetry", "wf_telemetry");
    const traceContextRepository = context.createTraceContextRepository();
    const spanStore = context.createSpanStore();
    const artifactStore = context.createArtifactStore();
    const metricPointStore = context.createMetricPointStore();

    const trace = await traceContextRepository.getOrCreate({
      runId: "run_telemetry",
      workflowId: "wf_telemetry",
      serviceName: "codemation.workflow",
    });
    await spanStore.upsert({
      traceId: trace.traceId,
      spanId: trace.rootSpanId,
      runId: "run_telemetry",
      workflowId: "wf_telemetry",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-04-14T10:00:00.000Z",
      endTime: "2026-04-14T10:00:05.000Z",
    });
    await spanStore.upsert({
      traceId: trace.traceId,
      spanId: "ai_span_match",
      parentSpanId: trace.rootSpanId,
      runId: "run_telemetry",
      workflowId: "wf_telemetry",
      name: "gen_ai.chat.completion",
      kind: "client",
      status: "completed",
      startTime: "2026-04-14T10:00:01.000Z",
      endTime: "2026-04-14T10:00:02.000Z",
      modelName: "gpt-4o-mini",
    });
    await spanStore.upsert({
      traceId: trace.traceId,
      spanId: "ai_span_outside_range",
      parentSpanId: trace.rootSpanId,
      runId: "run_telemetry",
      workflowId: "wf_telemetry",
      name: "gen_ai.chat.completion",
      kind: "client",
      status: "completed",
      startTime: "2026-04-14T11:00:01.000Z",
      endTime: "2026-04-14T11:00:02.000Z",
      modelName: "gpt-4o-mini",
    });
    await metricPointStore.save({
      traceId: trace.traceId,
      spanId: "ai_span_match",
      runId: "run_telemetry",
      workflowId: "wf_telemetry",
      name: "gen_ai.usage.total_tokens",
      value: 14,
      observedAt: "2026-04-14T10:00:02.000Z",
      modelName: "gpt-4o-mini",
    });
    await metricPointStore.save({
      traceId: trace.traceId,
      spanId: "ai_span_outside_range",
      runId: "run_telemetry",
      workflowId: "wf_telemetry",
      name: "gen_ai.usage.total_tokens",
      value: 100,
      observedAt: "2026-04-14T11:00:02.000Z",
      modelName: "gpt-4o-mini",
    });
    await artifactStore.save({
      traceId: trace.traceId,
      spanId: "ai_span_match",
      runId: "run_telemetry",
      workflowId: "wf_telemetry",
      kind: "ai.messages",
      contentType: "application/json",
      previewJson: { prompt: "hello" },
    });

    await expect(traceContextRepository.load("run_telemetry")).resolves.toMatchObject({
      traceId: trace.traceId,
      rootSpanId: trace.rootSpanId,
    });
    await expect(
      metricPointStore.list({
        workflowId: "wf_telemetry",
        modelNames: ["gpt-4o-mini"],
        metricNames: ["gen_ai.usage.total_tokens"],
        observedAtGte: "2026-04-14T10:00:00.000Z",
        observedAtLte: "2026-04-14T10:30:00.000Z",
      }),
    ).resolves.toMatchObject([
      {
        spanId: "ai_span_match",
        value: 14,
      },
    ]);
    await expect(artifactStore.listByTraceId(trace.traceId)).resolves.toHaveLength(1);
  });

  it("keeps telemetry after run deletion and prunes it by telemetry retention timestamps", async () => {
    await context.seedRun("run_retention", "wf_retention");
    const traceContextRepository = context.createTraceContextRepository();
    const spanStore = context.createSpanStore();
    const artifactStore = context.createArtifactStore();
    const metricPointStore = context.createMetricPointStore();

    const trace = await traceContextRepository.getOrCreate({
      runId: "run_retention",
      workflowId: "wf_retention",
      serviceName: "codemation.workflow",
    });
    await traceContextRepository.upsertExpiry({
      runId: "run_retention",
      expiresAt: "2026-07-01T00:00:00.000Z",
    });
    await spanStore.upsert({
      traceId: trace.traceId,
      spanId: trace.rootSpanId,
      runId: "run_retention",
      workflowId: "wf_retention",
      name: "workflow.run",
      kind: "internal",
      retentionExpiresAt: "2026-07-01T00:00:00.000Z",
    });
    await artifactStore.save({
      traceId: trace.traceId,
      spanId: trace.rootSpanId,
      runId: "run_retention",
      workflowId: "wf_retention",
      kind: "ai.messages",
      contentType: "application/json",
      previewJson: { prompt: "hello" },
      retentionExpiresAt: "2026-07-01T00:00:00.000Z",
    });
    await metricPointStore.save({
      traceId: trace.traceId,
      spanId: trace.rootSpanId,
      runId: "run_retention",
      workflowId: "wf_retention",
      name: "gen_ai.usage.total_tokens",
      value: 55,
      observedAt: "2026-04-14T10:00:02.000Z",
      retentionExpiresAt: "2026-07-01T00:00:00.000Z",
    });

    await context.deleteRun("run_retention");

    await expect(spanStore.listByTraceId(trace.traceId)).resolves.toHaveLength(1);
    await expect(artifactStore.listByTraceId(trace.traceId)).resolves.toHaveLength(1);
    await expect(metricPointStore.list({ runId: "run_retention" })).resolves.toHaveLength(1);

    await expect(spanStore.pruneExpired({ nowIso: "2026-08-01T00:00:00.000Z" })).resolves.toBe(1);
    await expect(artifactStore.pruneExpired({ nowIso: "2026-08-01T00:00:00.000Z" })).resolves.toBe(1);
    await expect(metricPointStore.pruneExpired({ nowIso: "2026-08-01T00:00:00.000Z" })).resolves.toBe(1);
  });
});
