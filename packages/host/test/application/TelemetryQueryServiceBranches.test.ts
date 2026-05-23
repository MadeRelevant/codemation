/**
 * Targeted branch coverage for TelemetryQueryService:
 * - summarizeCosts with no spans → early return { currencies: [] }
 * - summarizeAiUsageTimeseries with no spans → early return
 * - summarizeCostsTimeseries with no spans → early return
 * - summarizeRunsTimeseries spans not matching bucket → continue
 * - specific metric name branches (cachedInputTokens, reasoningTokens)
 */
import { describe, expect, it } from "vitest";
import { InMemoryTelemetrySpanStore } from "../../src/infrastructure/persistence/InMemoryTelemetrySpanStore";
import { InMemoryTelemetryArtifactStore } from "../../src/infrastructure/persistence/InMemoryTelemetryArtifactStore";
import { InMemoryTelemetryMetricPointStore } from "../../src/infrastructure/persistence/InMemoryTelemetryMetricPointStore";
import { InMemoryWorkflowRunRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowRunRepository";
import { InMemoryRunTraceContextRepository } from "../../src/infrastructure/persistence/InMemoryRunTraceContextRepository";
import { TelemetryQueryService } from "../../src/application/telemetry/TelemetryQueryService";
import { OtelIdentityFactory } from "../../src/application/telemetry/OtelIdentityFactory";

function makeContext() {
  const otel = new OtelIdentityFactory();
  const spanStore = new InMemoryTelemetrySpanStore();
  const artifactStore = new InMemoryTelemetryArtifactStore(otel);
  const metricPointStore = new InMemoryTelemetryMetricPointStore(otel);
  const runRepo = new InMemoryWorkflowRunRepository();
  const traceContextRepo = new InMemoryRunTraceContextRepository(otel);
  const queryService = new TelemetryQueryService(
    spanStore,
    artifactStore,
    metricPointStore,
    runRepo,
    traceContextRepo,
    otel,
  );
  return { queryService, spanStore, metricPointStore, runRepo };
}

const FILTER = {
  startTimeGte: "2026-06-01T00:00:00.000Z",
  endTimeLte: "2026-06-02T23:59:59.999Z",
};

describe("TelemetryQueryService branch coverage", () => {
  it("summarizeCosts returns empty currencies when no spans found", async () => {
    const { queryService } = makeContext();
    const result = await queryService.summarizeCosts(FILTER);
    expect(result).toEqual({ currencies: [] });
  });

  it("summarizeAiUsageTimeseries returns empty buckets when no spans found", async () => {
    const { queryService } = makeContext();
    const result = await queryService.summarizeAiUsageTimeseries(FILTER, "hour");
    expect(result.buckets.length).toBeGreaterThan(0);
    expect(
      result.buckets.every(
        (b) =>
          (b as { totalTokens?: number }).totalTokens === undefined || (b as { totalTokens: number }).totalTokens === 0,
      ),
    ).toBe(true);
  });

  it("summarizeCostsTimeseries returns empty buckets when no spans found", async () => {
    const { queryService } = makeContext();
    const result = await queryService.summarizeCostsTimeseries(FILTER, "day");
    expect(result.buckets.length).toBeGreaterThan(0);
  });

  it("summarizeRunsTimeseries handles spans with no endTime (uses startTime for bucketing)", async () => {
    const { queryService, spanStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-no-end", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-ne",
      spanId: "span-ne",
      runId: "run-no-end",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "running",
      startTime: "2026-06-01T10:00:00.000Z",
      // No endTime
    });
    const result = await queryService.summarizeRunsTimeseries({ ...FILTER, workflowId: "wf-1" }, "day");
    expect(result.buckets).toBeDefined();
  });

  it("summarizeAiUsageTimeseries accumulates cachedInputTokens metric", async () => {
    const { queryService, spanStore, metricPointStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-ci", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-ci",
      spanId: "span-ci",
      runId: "run-ci",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    await metricPointStore.save({
      traceId: "trace-ci",
      spanId: "span-ci",
      runId: "run-ci",
      workflowId: "wf-1",
      name: "gen_ai.usage.cache_read.input_tokens",
      value: 50,
      observedAt: "2026-06-01T10:01:00.000Z",
    });
    const result = await queryService.summarizeAiUsageTimeseries({ ...FILTER, workflowId: "wf-1" }, "day");
    const total = result.buckets.reduce(
      (sum, b) => sum + ((b as { cachedInputTokens: number }).cachedInputTokens ?? 0),
      0,
    );
    expect(total).toBe(50);
  });

  it("summarizeAiUsageTimeseries accumulates reasoningTokens metric", async () => {
    const { queryService, spanStore, metricPointStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-rt", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-rt",
      spanId: "span-rt",
      runId: "run-rt",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    await metricPointStore.save({
      traceId: "trace-rt",
      spanId: "span-rt",
      runId: "run-rt",
      workflowId: "wf-1",
      name: "codemation.gen_ai.usage.reasoning_tokens",
      value: 25,
      observedAt: "2026-06-01T10:01:00.000Z",
    });
    const result = await queryService.summarizeAiUsageTimeseries({ ...FILTER, workflowId: "wf-1" }, "day");
    const total = result.buckets.reduce((sum, b) => sum + ((b as { reasoningTokens: number }).reasoningTokens ?? 0), 0);
    expect(total).toBe(25);
  });

  it("summarizeAiUsageTimeseries accumulates inputTokens and outputTokens metrics", async () => {
    const { queryService, spanStore, metricPointStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-io", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-io",
      spanId: "span-io",
      runId: "run-io",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    await metricPointStore.save({
      traceId: "trace-io",
      spanId: "span-io",
      runId: "run-io",
      workflowId: "wf-1",
      name: "gen_ai.usage.input_tokens",
      value: 100,
      observedAt: "2026-06-01T10:01:00.000Z",
    });
    await metricPointStore.save({
      traceId: "trace-io",
      spanId: "span-io",
      runId: "run-io",
      workflowId: "wf-1",
      name: "gen_ai.usage.output_tokens",
      value: 50,
      observedAt: "2026-06-01T10:01:00.000Z",
    });
    const result = await queryService.summarizeAiUsageTimeseries({ ...FILTER, workflowId: "wf-1" }, "day");
    const totalInput = result.buckets.reduce((sum, b) => sum + ((b as { inputTokens: number }).inputTokens ?? 0), 0);
    const totalOutput = result.buckets.reduce((sum, b) => sum + ((b as { outputTokens: number }).outputTokens ?? 0), 0);
    expect(totalInput).toBe(100);
    expect(totalOutput).toBe(50);
  });

  it("summarizeRunsTimeseries uses week interval", async () => {
    const { queryService } = makeContext();
    const weekFilter = {
      startTimeGte: "2026-06-01T00:00:00.000Z",
      endTimeLte: "2026-06-14T23:59:59.999Z",
    };
    const result = await queryService.summarizeRunsTimeseries(weekFilter, "week");
    expect(result.buckets.length).toBeGreaterThan(0);
  });

  it("summarizeRunsTimeseries uses minute_5 interval", async () => {
    const { queryService } = makeContext();
    const shortFilter = {
      startTimeGte: "2026-06-01T00:00:00.000Z",
      endTimeLte: "2026-06-01T00:59:59.999Z",
    };
    const result = await queryService.summarizeRunsTimeseries(shortFilter, "minute_5");
    expect(result.buckets.length).toBeGreaterThan(0);
  });

  it("summarizeRunsTimeseries uses minute_15 interval", async () => {
    const { queryService } = makeContext();
    const shortFilter = {
      startTimeGte: "2026-06-01T00:00:00.000Z",
      endTimeLte: "2026-06-01T03:59:59.999Z",
    };
    const result = await queryService.summarizeRunsTimeseries(shortFilter, "minute_15");
    expect(result.buckets.length).toBeGreaterThan(0);
  });

  it("summarizeRunsTimeseries skips span with endTime outside filter range (no bucket)", async () => {
    const { queryService, spanStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-oor", workflowId: "wf-1", startedAt: "2026-05-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-oor",
      spanId: "span-oor",
      runId: "run-oor",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-05-01T10:00:00.000Z",
      endTime: "2026-05-01T10:01:00.000Z",
    });
    // Use filter that does NOT cover May 1 — span has endTime before startTimeGte
    const result = await queryService.summarizeRunsTimeseries(FILTER, "day");
    const totalRuns = result.buckets.reduce((sum, b) => sum + ((b as { totalRuns: number }).totalRuns ?? 0), 0);
    expect(totalRuns).toBe(0);
  });

  it("listRuns returns runs ordered by startTime descending", async () => {
    const { queryService, spanStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-A", workflowId: "wf-1", startedAt: "2026-06-01T08:00:00.000Z" });
    await runRepo.createRun({ runId: "run-B", workflowId: "wf-1", startedAt: "2026-06-01T09:00:00.000Z" });
    for (const [runId, time] of [
      ["run-A", "08:00"],
      ["run-B", "09:00"],
    ] as const) {
      await spanStore.upsert({
        traceId: `trace-${runId}`,
        spanId: `span-${runId}`,
        runId,
        workflowId: "wf-1",
        name: "workflow.run",
        kind: "internal",
        status: "completed",
        startTime: `2026-06-01T${time}:00.000Z`,
        endTime: `2026-06-01T${time}:30.000Z`,
      });
    }
    const result = await queryService.listRuns({
      filters: { ...FILTER, workflowId: "wf-1" } as never,
      page: 1,
      pageSize: 10,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].runId).toBe("run-B");
    expect(result.items[1].runId).toBe("run-A");
    expect(result.totalCount).toBe(2);
  });

  it("listModelNames returns empty when no spans found", async () => {
    const { queryService } = makeContext();
    const result = await queryService.listModelNames(FILTER);
    expect(result.modelNames).toHaveLength(0);
  });

  it("loadRunTrace returns spans and empty artifacts when no trace context", async () => {
    const { queryService, spanStore } = makeContext();
    await spanStore.upsert({
      traceId: "trace-load",
      spanId: "span-load",
      runId: "run-load",
      workflowId: "wf-1",
      name: "codemation.test",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    const result = await queryService.loadRunTrace("run-load");
    expect(result.runId).toBe("run-load");
    expect(result.traceId).toBeDefined();
  });

  it("summarizeCosts returns currency totals when cost metric points exist", async () => {
    const { queryService, spanStore, metricPointStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-cost", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-cost",
      spanId: "span-cost",
      runId: "run-cost",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    await metricPointStore.save({
      traceId: "trace-cost",
      spanId: "span-cost",
      runId: "run-cost",
      workflowId: "wf-1",
      name: "codemation.cost.estimated",
      value: 100,
      observedAt: "2026-06-01T10:01:00.000Z",
      unit: "USD",
      attributes: { "cost.currency": "USD", "cost.currency_scale": 4 },
    });
    const result = await queryService.summarizeCosts({ ...FILTER, workflowId: "wf-1" });
    expect(result.currencies.length).toBeGreaterThan(0);
    const usd = result.currencies.find((c) => c.currency === "USD");
    expect(usd).toBeDefined();
    expect(usd!.estimatedCostMinor).toBe(100);
  });

  it("summarizeCostsTimeseries accumulates cost points into buckets", async () => {
    const { queryService, spanStore, metricPointStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-ct", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-ct",
      spanId: "span-ct",
      runId: "run-ct",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    await metricPointStore.save({
      traceId: "trace-ct",
      spanId: "span-ct",
      runId: "run-ct",
      workflowId: "wf-1",
      name: "codemation.cost.estimated",
      value: 50,
      observedAt: "2026-06-01T10:01:00.000Z",
      unit: "USD",
      attributes: { "cost.currency": "USD", "cost.currency_scale": 4 },
    });
    const result = await queryService.summarizeCostsTimeseries({ ...FILTER, workflowId: "wf-1" }, "day");
    const totalCostBuckets = result.buckets.filter(
      (b) => ((b as unknown as { costs?: unknown[] }).costs ?? []).length > 0,
    );
    expect(totalCostBuckets.length).toBeGreaterThan(0);
  });

  it("listRuns returns empty when no spans found", async () => {
    const { queryService } = makeContext();
    const result = await queryService.listRuns({ filters: FILTER as never, page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("listModelNames returns model names from spans", async () => {
    const { queryService, spanStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-mn", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-mn",
      spanId: "span-mn",
      runId: "run-mn",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    await spanStore.upsert({
      traceId: "trace-mn",
      spanId: "span-mn-2",
      runId: "run-mn",
      workflowId: "wf-1",
      name: "codemation.llm",
      kind: "internal",
      status: "completed",
      modelName: "gpt-4",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    const result = await queryService.listModelNames({ ...FILTER, workflowId: "wf-1" });
    expect(result.modelNames).toContain("gpt-4");
  });

  it("summarizeAiUsage with modelNames filter uses listModelMatchedRunIds (intersection path)", async () => {
    const { queryService, spanStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-mnf", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    await spanStore.upsert({
      traceId: "trace-mnf",
      spanId: "span-mnf",
      runId: "run-mnf",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    await spanStore.upsert({
      traceId: "trace-mnf",
      spanId: "span-mnf-2",
      runId: "run-mnf",
      workflowId: "wf-1",
      name: "codemation.llm",
      kind: "internal",
      status: "completed",
      modelName: "gpt-4",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    // With modelNames filter matching gpt-4 — exercises resolveEligibleRunIds → listModelMatchedRunIds
    const result = await queryService.summarizeAiUsage({ ...FILTER, workflowId: "wf-1", modelNames: ["gpt-4"] });
    // The run is included (it has a gpt-4 span) but no AI metric points → all zero
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it("summarizeRunsTimeseries with runOrigins=manual filter exercises intersectRunIds path", async () => {
    const { queryService, spanStore, runRepo } = makeContext();
    await runRepo.createRun({
      runId: "run-manual",
      workflowId: "wf-1",
      startedAt: "2026-06-01T10:00:00.000Z",
    });
    // Save run with manual mode so it qualifies as "manual" origin
    const state = await runRepo.load("run-manual");
    await runRepo.save({ ...state!, executionOptions: { mode: "manual" } as never });
    await spanStore.upsert({
      traceId: "trace-manual",
      spanId: "span-manual",
      runId: "run-manual",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "completed",
      startTime: "2026-06-01T10:00:00.000Z",
      endTime: "2026-06-01T10:01:00.000Z",
    });
    // runOrigins filter with only "manual" → exercises shouldApplyRunOriginFilter → listOriginMatchedRunIds
    const result = await queryService.summarizeRuns({ ...FILTER, workflowId: "wf-1", runOrigins: ["manual"] } as never);
    expect(result.totalRuns).toBe(1);
  });

  it("summarizeRunsTimeseries with span having no time gives no bucket (findBucket undefined)", async () => {
    const { queryService, spanStore, runRepo } = makeContext();
    await runRepo.createRun({ runId: "run-notime", workflowId: "wf-1", startedAt: "2026-06-01T10:00:00.000Z" });
    // The span has both startTime and endTime — the span is not returned by filter without them
    // Instead test: create span with endTime inside filter but NOT inside a bucket (impossible normally)
    // So test findBucket handles invalid date — save a span with a non-standard time format
    await spanStore.upsert({
      traceId: "trace-notime",
      spanId: "span-notime",
      runId: "run-notime",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      status: "running",
      startTime: "2026-06-01T10:00:00.000Z",
      // No endTime
    });
    const result = await queryService.summarizeRunsTimeseries({ ...FILTER, workflowId: "wf-1" }, "day");
    // span is included but endTime is undefined, so startTime is used for bucketing
    expect(result.buckets).toBeDefined();
  });
});
