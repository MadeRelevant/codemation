import { afterEach, describe, expect, it } from "vitest";
import { codemationApiClient } from "../../src/api/CodemationApiClient";
import { fetchTelemetryRunTrace } from "../../src/features/workflows/lib/realtime/realtimeApi";

describe("realtimeApi.fetchTelemetryRunTrace", () => {
  const originalGetJson = codemationApiClient.getJson.bind(codemationApiClient);

  afterEach(() => {
    codemationApiClient.getJson = originalGetJson;
  });

  it("calls the telemetry trace endpoint without request init when no signal is provided", async () => {
    const calls: Array<Readonly<{ url: string; init: RequestInit | undefined }>> = [];
    codemationApiClient.getJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
      calls.push({ url, init });
      return {
        traceId: "trace_1",
        runId: "run_1",
        spans: [],
        artifacts: [],
        metricPoints: [],
      } as T;
    };

    const result = await fetchTelemetryRunTrace("run_1");

    expect(calls).toEqual([{ url: "/api/telemetry/runs/run_1/trace", init: undefined }]);
    expect(result.runId).toBe("run_1");
  });

  it("forwards AbortSignal instances to the shared api client", async () => {
    const calls: Array<Readonly<{ url: string; init: RequestInit | undefined }>> = [];
    const signal = new AbortController().signal;
    codemationApiClient.getJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
      calls.push({ url, init });
      return {
        traceId: "trace_2",
        runId: "run_2",
        spans: [],
        artifacts: [],
        metricPoints: [],
      } as T;
    };

    const result = await fetchTelemetryRunTrace("run_2", { signal });

    expect(calls).toEqual([{ url: "/api/telemetry/runs/run_2/trace", init: { signal } }]);
    expect(result.traceId).toBe("trace_2");
  });
});
