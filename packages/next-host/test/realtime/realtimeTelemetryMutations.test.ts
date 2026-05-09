import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type {
  TelemetryRunTraceViewDto,
  TelemetrySpanRecordDto,
} from "../../src/features/workflows/lib/realtime/realtimeDomainTypes";
import { applyTelemetrySpanEvent } from "../../src/features/workflows/lib/realtime/realtimeTelemetryMutations";
import { telemetryRunTraceQueryKey } from "../../src/features/workflows/lib/realtime/realtimeQueryKeys";

let spanCounter = 0;

function makeSpan(overrides: Partial<TelemetrySpanRecordDto> = {}): TelemetrySpanRecordDto {
  return {
    traceId: "trace_1",
    spanId: `span_${String(++spanCounter)}`,
    runId: "run_1",
    workflowId: "wf_1",
    name: "workflow.node",
    kind: "internal",
    ...overrides,
  };
}

function makeTrace(runId: string, spans: ReadonlyArray<TelemetrySpanRecordDto>): TelemetryRunTraceViewDto {
  return {
    traceId: "trace_1",
    runId,
    spans,
    artifacts: [],
    metricPoints: [],
  };
}

describe("applyTelemetrySpanEvent", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("is a no-op when the cache is empty (initial fetch has not landed)", () => {
    const span = makeSpan({ spanId: "span_1" });
    applyTelemetrySpanEvent(queryClient, "run_1", span);

    const cached = queryClient.getQueryData<TelemetryRunTraceViewDto>(telemetryRunTraceQueryKey("run_1"));
    expect(cached).toBeUndefined();
  });

  it("appends a new span to the cached trace (N → N+1)", () => {
    const existing = makeSpan({ spanId: "span_existing", startTime: "2024-01-01T00:00:00.000Z" });
    queryClient.setQueryData(telemetryRunTraceQueryKey("run_1"), makeTrace("run_1", [existing]));

    const incoming = makeSpan({ spanId: "span_new", startTime: "2024-01-01T00:00:01.000Z" });
    applyTelemetrySpanEvent(queryClient, "run_1", incoming);

    const cached = queryClient.getQueryData<TelemetryRunTraceViewDto>(telemetryRunTraceQueryKey("run_1"));
    expect(cached?.spans).toHaveLength(2);
  });

  it("deduplicates by spanId — replaces existing span with same id", () => {
    const initial = makeSpan({ spanId: "span_dup", status: "running", startTime: "2024-01-01T00:00:00.000Z" });
    queryClient.setQueryData(telemetryRunTraceQueryKey("run_1"), makeTrace("run_1", [initial]));

    const updated = makeSpan({ spanId: "span_dup", status: "completed", startTime: "2024-01-01T00:00:00.000Z" });
    applyTelemetrySpanEvent(queryClient, "run_1", updated);

    const cached = queryClient.getQueryData<TelemetryRunTraceViewDto>(telemetryRunTraceQueryKey("run_1"));
    expect(cached?.spans).toHaveLength(1);
    expect(cached?.spans[0]?.status).toBe("completed");
  });

  it("sorts spans by startTime ascending", () => {
    const a = makeSpan({ spanId: "span_a", startTime: "2024-01-01T00:00:02.000Z" });
    const b = makeSpan({ spanId: "span_b", startTime: "2024-01-01T00:00:01.000Z" });
    queryClient.setQueryData(telemetryRunTraceQueryKey("run_1"), makeTrace("run_1", [a]));

    applyTelemetrySpanEvent(queryClient, "run_1", b);

    const cached = queryClient.getQueryData<TelemetryRunTraceViewDto>(telemetryRunTraceQueryKey("run_1"));
    expect(cached?.spans[0]?.spanId).toBe("span_b");
    expect(cached?.spans[1]?.spanId).toBe("span_a");
  });

  it("places spans without startTime after spans with startTime", () => {
    const withTime = makeSpan({ spanId: "span_with", startTime: "2024-01-01T00:00:00.000Z" });
    queryClient.setQueryData(telemetryRunTraceQueryKey("run_1"), makeTrace("run_1", [withTime]));

    const withoutTime = makeSpan({ spanId: "span_without", startTime: undefined });
    applyTelemetrySpanEvent(queryClient, "run_1", withoutTime);

    const cached = queryClient.getQueryData<TelemetryRunTraceViewDto>(telemetryRunTraceQueryKey("run_1"));
    expect(cached?.spans[0]?.spanId).toBe("span_with");
    expect(cached?.spans[1]?.spanId).toBe("span_without");
  });

  it("preserves other trace properties (traceId, artifacts, metricPoints)", () => {
    const trace = makeTrace("run_1", []);
    queryClient.setQueryData(telemetryRunTraceQueryKey("run_1"), trace);

    const span = makeSpan({ spanId: "span_new" });
    applyTelemetrySpanEvent(queryClient, "run_1", span);

    const cached = queryClient.getQueryData<TelemetryRunTraceViewDto>(telemetryRunTraceQueryKey("run_1"));
    expect(cached?.traceId).toBe(trace.traceId);
    expect(cached?.artifacts).toBe(trace.artifacts);
    expect(cached?.metricPoints).toBe(trace.metricPoints);
  });
});
