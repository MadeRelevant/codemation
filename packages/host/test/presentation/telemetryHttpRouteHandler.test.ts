import { afterEach, describe, expect, it } from "vitest";
import type { QueryBus } from "../../src/application/bus/QueryBus";
import { GetTelemetryRunTraceQuery } from "../../src/application/queries/GetTelemetryRunTraceQuery";
import { TelemetryHttpRouteHandler } from "../../src/presentation/http/routeHandlers/TelemetryHttpRouteHandler";

class FakeQueryBus implements QueryBus {
  readonly queries: unknown[] = [];

  constructor(
    private readonly result: unknown,
    private readonly error?: Error,
  ) {}

  async execute<TResponse>(query: unknown): Promise<TResponse> {
    this.queries.push(query);
    if (this.error) {
      throw this.error;
    }
    return this.result as TResponse;
  }
}

describe("TelemetryHttpRouteHandler", () => {
  const originalConsoleError = console.error;

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("returns 400 when run trace requests omit the run id", async () => {
    const handler = new TelemetryHttpRouteHandler(new FakeQueryBus({}));

    const response = await handler.getRunTrace("   ");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Run trace request requires a run id.",
    });
  });

  it("executes the run trace query for valid run ids", async () => {
    const queryBus = new FakeQueryBus({
      traceId: "trace_1",
      runId: "run_1",
      spans: [],
      artifacts: [],
      metricPoints: [],
    });
    const handler = new TelemetryHttpRouteHandler(queryBus);

    const response = await handler.getRunTrace("run_1");

    expect(response.status).toBe(200);
    expect(queryBus.queries).toEqual([new GetTelemetryRunTraceQuery("run_1")]);
    await expect(response.json()).resolves.toEqual({
      traceId: "trace_1",
      runId: "run_1",
      spans: [],
      artifacts: [],
      metricPoints: [],
    });
  });

  it("converts unexpected query failures into a generic server error response (no internal detail)", async () => {
    console.error = () => {};
    const handler = new TelemetryHttpRouteHandler(new FakeQueryBus({}, new Error("telemetry exploded")));

    const response = await handler.getRunTrace("run_1");

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toContain("telemetry exploded");
  });
});
