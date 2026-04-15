import { describe, expect, it } from "vitest";
import { InMemoryRunTraceContextRepository } from "../../src/infrastructure/persistence/InMemoryRunTraceContextRepository";
import { InMemoryTelemetryArtifactStore } from "../../src/infrastructure/persistence/InMemoryTelemetryArtifactStore";
import { InMemoryTelemetryMetricPointStore } from "../../src/infrastructure/persistence/InMemoryTelemetryMetricPointStore";
import { InMemoryTelemetrySpanStore } from "../../src/infrastructure/persistence/InMemoryTelemetrySpanStore";
import { GetTelemetryDashboardDimensionsQuery } from "../../src/application/queries/GetTelemetryDashboardDimensionsQuery";
import { GetTelemetryDashboardDimensionsQueryHandler } from "../../src/application/queries/GetTelemetryDashboardDimensionsQueryHandler";
import { GetTelemetryDashboardSummaryQuery } from "../../src/application/queries/GetTelemetryDashboardSummaryQuery";
import { GetTelemetryDashboardSummaryQueryHandler } from "../../src/application/queries/GetTelemetryDashboardSummaryQueryHandler";
import { GetTelemetryDashboardTimeseriesQuery } from "../../src/application/queries/GetTelemetryDashboardTimeseriesQuery";
import { GetTelemetryDashboardTimeseriesQueryHandler } from "../../src/application/queries/GetTelemetryDashboardTimeseriesQueryHandler";
import { TelemetryQueryService } from "../../src/application/telemetry/TelemetryQueryService";
import { OtelIdentityFactory } from "../../src/application/telemetry/OtelIdentityFactory";

class TelemetryDashboardTestContext {
  readonly traceContextRepository = new InMemoryRunTraceContextRepository(new OtelIdentityFactory());
  readonly spanStore = new InMemoryTelemetrySpanStore();
  readonly artifactStore = new InMemoryTelemetryArtifactStore(new OtelIdentityFactory());
  readonly metricPointStore = new InMemoryTelemetryMetricPointStore(new OtelIdentityFactory());
  readonly queryService = new TelemetryQueryService(
    this.spanStore,
    this.artifactStore,
    this.metricPointStore,
    this.traceContextRepository,
    new OtelIdentityFactory(),
  );

  async seedRun(
    args: Readonly<{
      traceId: string;
      rootSpanId: string;
      runId: string;
      workflowId: string;
      status: "completed" | "failed" | "running";
      startTime: string;
      endTime?: string;
      modelName?: string;
      totalTokens?: number;
    }>,
  ): Promise<void> {
    await this.spanStore.upsert({
      traceId: args.traceId,
      spanId: args.rootSpanId,
      runId: args.runId,
      workflowId: args.workflowId,
      name: "workflow.run",
      kind: "internal",
      status: args.status,
      startTime: args.startTime,
      endTime: args.endTime,
    });
    if (args.modelName) {
      await this.spanStore.upsert({
        traceId: args.traceId,
        spanId: `${args.rootSpanId}-ai`,
        parentSpanId: args.rootSpanId,
        runId: args.runId,
        workflowId: args.workflowId,
        name: "gen_ai.chat.completion",
        kind: "client",
        status: "completed",
        startTime: args.startTime,
        endTime: args.endTime ?? args.startTime,
        modelName: args.modelName,
      });
    }
    if (args.totalTokens !== undefined) {
      await this.metricPointStore.save({
        traceId: args.traceId,
        spanId: `${args.rootSpanId}-ai`,
        runId: args.runId,
        workflowId: args.workflowId,
        name: "gen_ai.usage.total_tokens",
        value: args.totalTokens,
        observedAt: args.endTime ?? args.startTime,
        modelName: args.modelName,
      });
    }
  }
}

describe("telemetry dashboard query service", () => {
  it("supports multi-workflow summary and daily timeseries aggregation", async () => {
    const context = new TelemetryDashboardTestContext();
    await context.seedRun({
      traceId: "trace-a",
      rootSpanId: "span-a",
      runId: "run-a",
      workflowId: "wf-a",
      status: "completed",
      startTime: "2026-04-10T08:00:00.000Z",
      endTime: "2026-04-10T08:10:00.000Z",
      modelName: "gpt-4o-mini",
      totalTokens: 10,
    });
    await context.seedRun({
      traceId: "trace-b",
      rootSpanId: "span-b",
      runId: "run-b",
      workflowId: "wf-b",
      status: "failed",
      startTime: "2026-04-11T09:00:00.000Z",
      endTime: "2026-04-11T09:05:00.000Z",
      modelName: "gpt-4.1-mini",
      totalTokens: 20,
    });

    await expect(
      context.queryService.summarizeRuns({
        workflowIds: ["wf-a", "wf-b"],
        startTimeGte: "2026-04-10T00:00:00.000Z",
        endTimeLte: "2026-04-12T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      totalRuns: 2,
      completedRuns: 1,
      failedRuns: 1,
      runningRuns: 0,
      averageDurationMs: 450000,
    });

    await expect(
      context.queryService.summarizeRunsTimeseries(
        {
          workflowIds: ["wf-a", "wf-b"],
          startTimeGte: "2026-04-10T00:00:00.000Z",
          endTimeLte: "2026-04-12T00:00:00.000Z",
        },
        "day",
      ),
    ).resolves.toMatchObject({
      interval: "day",
      buckets: [
        { bucketStartIso: "2026-04-10T00:00:00.000Z", completedRuns: 1, failedRuns: 0, totalTokens: 0 },
        { bucketStartIso: "2026-04-11T00:00:00.000Z", completedRuns: 0, failedRuns: 1, totalTokens: 0 },
        { bucketStartIso: "2026-04-12T00:00:00.000Z", completedRuns: 0, failedRuns: 0, totalTokens: 0 },
      ],
    });

    await expect(
      context.queryService.summarizeAiUsageTimeseries(
        {
          workflowIds: ["wf-a", "wf-b"],
          startTimeGte: "2026-04-10T00:00:00.000Z",
          endTimeLte: "2026-04-12T00:00:00.000Z",
        },
        "day",
      ),
    ).resolves.toMatchObject({
      buckets: [
        { bucketStartIso: "2026-04-10T00:00:00.000Z", totalTokens: 10 },
        { bucketStartIso: "2026-04-11T00:00:00.000Z", totalTokens: 20 },
        { bucketStartIso: "2026-04-12T00:00:00.000Z", totalTokens: 0 },
      ],
    });
  });

  it("lists distinct model names for the current telemetry slice", async () => {
    const context = new TelemetryDashboardTestContext();
    await context.seedRun({
      traceId: "trace-1",
      rootSpanId: "span-1",
      runId: "run-1",
      workflowId: "wf-a",
      status: "completed",
      startTime: "2026-04-14T10:00:00.000Z",
      endTime: "2026-04-14T10:01:00.000Z",
      modelName: "gpt-4o-mini",
    });
    await context.seedRun({
      traceId: "trace-2",
      rootSpanId: "span-2",
      runId: "run-2",
      workflowId: "wf-b",
      status: "completed",
      startTime: "2026-04-14T11:00:00.000Z",
      endTime: "2026-04-14T11:01:00.000Z",
      modelName: "gpt-4.1-mini",
    });

    await expect(
      context.queryService.listModelNames({
        workflowIds: ["wf-a", "wf-b"],
        startTimeGte: "2026-04-14T00:00:00.000Z",
        endTimeLte: "2026-04-15T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      modelNames: ["gpt-4.1-mini", "gpt-4o-mini"],
    });
  });

  it("returns zero ai usage and empty model dimensions when status filters match no runs", async () => {
    const context = new TelemetryDashboardTestContext();

    await expect(
      context.queryService.summarizeAiUsage({
        workflowIds: ["wf-missing"],
        statuses: ["failed"],
        startTimeGte: "2026-04-14T00:00:00.000Z",
        endTimeLte: "2026-04-15T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
    });

    await expect(
      context.queryService.listModelNames({
        workflowIds: ["wf-missing"],
        statuses: ["failed"],
        startTimeGte: "2026-04-14T00:00:00.000Z",
        endTimeLte: "2026-04-15T00:00:00.000Z",
      }),
    ).resolves.toEqual({ modelNames: [] });
  });

  it("covers hour buckets and dashboard query handlers", async () => {
    const context = new TelemetryDashboardTestContext();
    await context.seedRun({
      traceId: "trace-hour",
      rootSpanId: "span-hour",
      runId: "run-hour",
      workflowId: "wf-hour",
      status: "running",
      startTime: "2026-04-14T10:15:00.000Z",
      modelName: "gpt-4o-mini",
      totalTokens: 7,
    });
    const summaryHandler = new GetTelemetryDashboardSummaryQueryHandler(context.queryService);
    const timeseriesHandler = new GetTelemetryDashboardTimeseriesQueryHandler(context.queryService);
    const dimensionsHandler = new GetTelemetryDashboardDimensionsQueryHandler(context.queryService);

    await expect(
      summaryHandler.execute(
        new GetTelemetryDashboardSummaryQuery({
          workflowIds: ["wf-hour"],
          startTimeGte: "2026-04-14T10:00:00.000Z",
          endTimeLte: "2026-04-14T12:00:00.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      runs: { totalRuns: 1, runningRuns: 1 },
      ai: { totalTokens: 7 },
    });

    await expect(
      timeseriesHandler.execute(
        new GetTelemetryDashboardTimeseriesQuery({
          interval: "hour",
          filters: {
            workflowIds: ["wf-hour"],
            startTimeGte: "2026-04-14T10:00:00.000Z",
            endTimeLte: "2026-04-14T12:00:00.000Z",
          },
        }),
      ),
    ).resolves.toMatchObject({
      interval: "hour",
      buckets: [
        { bucketStartIso: "2026-04-14T10:00:00.000Z", runningRuns: 1, totalTokens: 7 },
        { bucketStartIso: "2026-04-14T11:00:00.000Z", runningRuns: 0, totalTokens: 0 },
        { bucketStartIso: "2026-04-14T12:00:00.000Z", runningRuns: 0, totalTokens: 0 },
      ],
    });

    await expect(
      dimensionsHandler.execute(
        new GetTelemetryDashboardDimensionsQuery({
          workflowIds: ["wf-hour"],
          startTimeGte: "2026-04-14T10:00:00.000Z",
          endTimeLte: "2026-04-14T12:00:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      modelNames: ["gpt-4o-mini"],
    });
  });
});
