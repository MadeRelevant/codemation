import { describe, expect, it } from "vitest";
import { InMemoryTelemetrySpanStore } from "../../src/infrastructure/persistence/InMemoryTelemetrySpanStore";
import { InMemoryTelemetryMetricPointStore } from "../../src/infrastructure/persistence/InMemoryTelemetryMetricPointStore";

// ---------------------------------------------------------------------------
// InMemoryTelemetrySpanStore
// ---------------------------------------------------------------------------

function makeSpanUpsert(
  overrides: Partial<{
    traceId: string;
    spanId: string;
    runId: string;
    workflowId: string;
    startTime: string;
    endTime: string;
    status: "running" | "completed" | "failed";
    name: string;
    modelName: string;
    runIds: undefined;
  }> = {},
) {
  return {
    traceId: overrides.traceId ?? "trace-1",
    spanId: overrides.spanId ?? "span-1",
    runId: overrides.runId ?? "run-1",
    workflowId: overrides.workflowId ?? "wf-1",
    startTime: overrides.startTime ?? "2026-01-01T00:00:00.000Z",
    endTime: overrides.endTime ?? "2026-01-01T00:00:01.000Z",
    status: overrides.status ?? ("completed" as const),
    name: overrides.name ?? "codemation.test.span",
    modelName: overrides.modelName,
    attributes: {},
  };
}

describe("InMemoryTelemetrySpanStore", () => {
  it("list returns empty initially", async () => {
    const store = new InMemoryTelemetrySpanStore();
    expect(await store.list()).toHaveLength(0);
  });

  it("upsert + list returns the span", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert());
    const results = await store.list();
    expect(results).toHaveLength(1);
    expect(results[0].spanId).toBe("span-1");
  });

  it("filters by traceId", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ traceId: "trace-A", spanId: "span-A" }));
    await store.upsert(makeSpanUpsert({ traceId: "trace-B", spanId: "span-B" }));
    const results = await store.list({ traceId: "trace-A" });
    expect(results).toHaveLength(1);
    expect(results[0].spanId).toBe("span-A");
  });

  it("filters by runId", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ runId: "run-X", spanId: "span-X" }));
    await store.upsert(makeSpanUpsert({ runId: "run-Y", spanId: "span-Y" }));
    const results = await store.list({ runId: "run-X" });
    expect(results).toHaveLength(1);
    expect(results[0].spanId).toBe("span-X");
  });

  it("filters by runIds array", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ runId: "run-1", spanId: "span-1" }));
    await store.upsert(makeSpanUpsert({ runId: "run-2", spanId: "span-2" }));
    await store.upsert(makeSpanUpsert({ runId: "run-3", spanId: "span-3" }));
    const results = await store.list({ runIds: ["run-1", "run-3"] });
    expect(results).toHaveLength(2);
  });

  it("filters by workflowId", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ workflowId: "wf-A", spanId: "span-A" }));
    await store.upsert(makeSpanUpsert({ workflowId: "wf-B", spanId: "span-B" }));
    const results = await store.list({ workflowId: "wf-A" });
    expect(results).toHaveLength(1);
  });

  it("filters by workflowIds array", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ workflowId: "wf-1", spanId: "span-1" }));
    await store.upsert(makeSpanUpsert({ workflowId: "wf-2", spanId: "span-2" }));
    const results = await store.list({ workflowIds: ["wf-1"] });
    expect(results).toHaveLength(1);
  });

  it("filters by statuses", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ spanId: "ok-span", status: "completed" }));
    await store.upsert(makeSpanUpsert({ traceId: "t2", spanId: "err-span", status: "failed" }));
    const results = await store.list({ statuses: ["completed"] });
    expect(results).toHaveLength(1);
    expect(results[0].spanId).toBe("ok-span");
  });

  it("filters by names", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ spanId: "span-named", name: "codemation.llm" }));
    await store.upsert(makeSpanUpsert({ traceId: "t2", spanId: "span-other", name: "codemation.other" }));
    const results = await store.list({ names: ["codemation.llm"] });
    expect(results).toHaveLength(1);
  });

  it("filters by modelNames", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert({ ...makeSpanUpsert({ spanId: "gpt-span" }), modelName: "gpt-4" });
    await store.upsert({ ...makeSpanUpsert({ traceId: "t2", spanId: "other-span" }), modelName: undefined });
    const results = await store.list({ modelNames: ["gpt-4"] });
    expect(results).toHaveLength(1);
    expect(results[0].spanId).toBe("gpt-span");
  });

  it("filters by startTimeGte", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ spanId: "old", startTime: "2026-01-01T00:00:00.000Z" }));
    await store.upsert(makeSpanUpsert({ traceId: "t2", spanId: "new", startTime: "2026-06-01T00:00:00.000Z" }));
    const results = await store.list({ startTimeGte: "2026-03-01T00:00:00.000Z" });
    expect(results).toHaveLength(1);
    expect(results[0].spanId).toBe("new");
  });

  it("filters by endTimeLte", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ spanId: "early", endTime: "2026-01-01T00:01:00.000Z" }));
    await store.upsert(makeSpanUpsert({ traceId: "t2", spanId: "late", endTime: "2026-12-01T00:01:00.000Z" }));
    const results = await store.list({ endTimeLte: "2026-06-01T00:00:00.000Z" });
    expect(results).toHaveLength(1);
    expect(results[0].spanId).toBe("early");
  });

  it("pruneExpired removes expired spans respecting limit", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert({ ...makeSpanUpsert({ spanId: "exp-1" }), retentionExpiresAt: "2026-01-01T00:00:00.000Z" });
    await store.upsert({
      ...makeSpanUpsert({ traceId: "t2", spanId: "exp-2" }),
      retentionExpiresAt: "2026-01-02T00:00:00.000Z",
    });
    await store.upsert({
      ...makeSpanUpsert({ traceId: "t3", spanId: "keep" }),
      retentionExpiresAt: "2026-12-31T00:00:00.000Z",
    });
    const pruned = await store.pruneExpired({ nowIso: "2026-06-01T00:00:00.000Z", limit: 1 });
    expect(pruned).toBe(1);
    // One of the expired ones was removed, "keep" remains
    const remaining = await store.list();
    expect(remaining).toHaveLength(2);
  });

  it("listByTraceId delegates to list with traceId filter", async () => {
    const store = new InMemoryTelemetrySpanStore();
    await store.upsert(makeSpanUpsert({ traceId: "trace-XYZ", spanId: "span-XYZ" }));
    await store.upsert(makeSpanUpsert({ traceId: "other", spanId: "other-span" }));
    const results = await store.listByTraceId("trace-XYZ");
    expect(results).toHaveLength(1);
    expect(results[0].spanId).toBe("span-XYZ");
  });
});

// ---------------------------------------------------------------------------
// InMemoryTelemetryMetricPointStore
// ---------------------------------------------------------------------------

function makeOtelFactory() {
  let counter = 0;
  return { createArtifactId: () => `mp-${++counter}` };
}

function makeMetricWrite(
  overrides: Partial<{
    traceId: string;
    spanId: string;
    runId: string;
    workflowId: string;
    nodeId: string;
    name: string;
    value: number;
    modelName: string;
    observedAt: string;
    retentionExpiresAt: string;
  }> = {},
) {
  return {
    traceId: overrides.traceId ?? "trace-1",
    spanId: overrides.spanId ?? "span-1",
    runId: overrides.runId ?? "run-1",
    workflowId: overrides.workflowId ?? "wf-1",
    nodeId: overrides.nodeId ?? "node-1",
    activationId: "act-1",
    name: overrides.name ?? "gen_ai.usage.input_tokens",
    value: overrides.value ?? 100,
    unit: "tokens",
    observedAt: overrides.observedAt ?? "2026-01-01T00:00:00.000Z",
    attributes: {},
    modelName: overrides.modelName,
    retentionExpiresAt: overrides.retentionExpiresAt,
  };
}

describe("InMemoryTelemetryMetricPointStore", () => {
  it("save stores and list returns the record", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    const record = await store.save(makeMetricWrite());
    expect(record.metricPointId).toBeDefined();
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].metricName).toBe("gen_ai.usage.input_tokens");
  });

  it("filters by traceId", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ traceId: "trace-A" }));
    await store.save(makeMetricWrite({ traceId: "trace-B" }));
    const results = await store.list({ traceId: "trace-A" });
    expect(results).toHaveLength(1);
  });

  it("filters by runId", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ runId: "run-X" }));
    await store.save(makeMetricWrite({ runId: "run-Y" }));
    const results = await store.list({ runId: "run-X" });
    expect(results).toHaveLength(1);
  });

  it("filters by runIds array", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ runId: "run-1" }));
    await store.save(makeMetricWrite({ runId: "run-2" }));
    await store.save(makeMetricWrite({ runId: "run-3" }));
    const results = await store.list({ runIds: ["run-1", "run-3"] });
    expect(results).toHaveLength(2);
  });

  it("filters by workflowId", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ workflowId: "wf-A" }));
    await store.save(makeMetricWrite({ workflowId: "wf-B" }));
    const results = await store.list({ workflowId: "wf-A" });
    expect(results).toHaveLength(1);
  });

  it("filters by workflowIds array", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ workflowId: "wf-1" }));
    await store.save(makeMetricWrite({ workflowId: "wf-2" }));
    const results = await store.list({ workflowIds: ["wf-1"] });
    expect(results).toHaveLength(1);
  });

  it("filters by nodeId", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ nodeId: "node-A" }));
    await store.save(makeMetricWrite({ nodeId: "node-B" }));
    const results = await store.list({ nodeId: "node-A" });
    expect(results).toHaveLength(1);
  });

  it("filters by metricNames", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ name: "gen_ai.usage.input_tokens" }));
    await store.save(makeMetricWrite({ name: "gen_ai.usage.output_tokens" }));
    const results = await store.list({ metricNames: ["gen_ai.usage.input_tokens"] });
    expect(results).toHaveLength(1);
  });

  it("filters by modelNames", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save({ ...makeMetricWrite(), modelName: "gpt-4" });
    await store.save({ ...makeMetricWrite(), modelName: undefined });
    const results = await store.list({ modelNames: ["gpt-4"] });
    expect(results).toHaveLength(1);
  });

  it("filters by observedAtGte", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ observedAt: "2026-01-01T00:00:00.000Z" }));
    await store.save(makeMetricWrite({ observedAt: "2026-06-01T00:00:00.000Z" }));
    const results = await store.list({ observedAtGte: "2026-03-01T00:00:00.000Z" });
    expect(results).toHaveLength(1);
    expect(results[0].observedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("filters by observedAtLte", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save(makeMetricWrite({ observedAt: "2026-01-01T00:00:00.000Z" }));
    await store.save(makeMetricWrite({ observedAt: "2026-06-01T00:00:00.000Z" }));
    const results = await store.list({ observedAtLte: "2026-03-01T00:00:00.000Z" });
    expect(results).toHaveLength(1);
    expect(results[0].observedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("pruneExpired removes expired records respecting limit", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    await store.save({ ...makeMetricWrite(), retentionExpiresAt: "2026-01-01T00:00:00.000Z" });
    await store.save({ ...makeMetricWrite(), retentionExpiresAt: "2026-01-02T00:00:00.000Z" });
    await store.save({ ...makeMetricWrite(), retentionExpiresAt: "2026-12-31T00:00:00.000Z" });
    const pruned = await store.pruneExpired({ nowIso: "2026-06-01T00:00:00.000Z", limit: 1 });
    expect(pruned).toBe(1);
    const remaining = await store.list();
    expect(remaining).toHaveLength(2);
  });

  it("list respects limit", async () => {
    const store = new InMemoryTelemetryMetricPointStore(makeOtelFactory() as never);
    for (let i = 0; i < 5; i++) {
      await store.save(makeMetricWrite({ observedAt: `2026-01-0${i + 1}T00:00:00.000Z` }));
    }
    const results = await store.list({ limit: 2 });
    expect(results).toHaveLength(2);
  });
});
