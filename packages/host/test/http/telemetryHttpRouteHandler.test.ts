// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import type { Query } from "../../src/application/bus/Query";
import type { QueryBus } from "../../src/application/bus/QueryBus";
import { GetTelemetryDashboardDimensionsQuery } from "../../src/application/queries/GetTelemetryDashboardDimensionsQuery";
import { GetTelemetryDashboardRunsQuery } from "../../src/application/queries/GetTelemetryDashboardRunsQuery";
import { GetTelemetryDashboardSummaryQuery } from "../../src/application/queries/GetTelemetryDashboardSummaryQuery";
import { GetTelemetryDashboardTimeseriesQuery } from "../../src/application/queries/GetTelemetryDashboardTimeseriesQuery";
import { TelemetryHttpRouteHandler } from "../../src/presentation/http/routeHandlers/TelemetryHttpRouteHandler";

class QueryBusStub implements QueryBus {
  readonly executedQueries: Array<Query<unknown>> = [];

  constructor(private readonly resolver: (query: Query<unknown>) => Promise<unknown>) {}

  async execute<TResult>(query: Query<TResult>): Promise<TResult> {
    this.executedQueries.push(query as Query<unknown>);
    return (await this.resolver(query as Query<unknown>)) as TResult;
  }
}

class TelemetryHttpRouteHandlerTestRequestFactory {
  create(pathAndQuery: string): Request {
    return new Request(`http://localhost${pathAndQuery}`);
  }
}

describe("TelemetryHttpRouteHandler", () => {
  const priorConsoleError = console.error;

  afterEach(() => {
    console.error = priorConsoleError;
  });

  it("parses summary filters and forwards the normalized query", async () => {
    const queryBus = new QueryBusStub(async () => ({
      runs: {
        totalRuns: 2,
        completedRuns: 1,
        failedRuns: 1,
        runningRuns: 0,
        averageDurationMs: 450000,
      },
      ai: {
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
        cachedInputTokens: 2,
        reasoningTokens: 1,
      },
    }));
    const handler = new TelemetryHttpRouteHandler(queryBus);
    const request = new TelemetryHttpRouteHandlerTestRequestFactory().create(
      "/api/telemetry/dashboard/summary?workflowId=wf-a&workflowId=%20wf-b%20&status=completed&status=running&modelName=%20gpt-4o-mini%20&startTimeGte=2026-04-14T00:00:00.000Z&endTimeLte=2026-04-15T00:00:00.000Z",
    );

    const response = await handler.getDashboardSummary(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runs: { totalRuns: 2 },
      ai: { totalTokens: 16 },
    });
    expect(queryBus.executedQueries).toHaveLength(1);
    expect(queryBus.executedQueries[0]).toBeInstanceOf(GetTelemetryDashboardSummaryQuery);
    expect((queryBus.executedQueries[0] as GetTelemetryDashboardSummaryQuery).filters).toEqual({
      workflowIds: ["wf-a", "wf-b"],
      statuses: ["completed", "running"],
      runOrigins: undefined,
      modelNames: ["gpt-4o-mini"],
      startTimeGte: "2026-04-14T00:00:00.000Z",
      endTimeLte: "2026-04-15T00:00:00.000Z",
    });
  });

  it("parses timeseries interval and dimensions requests", async () => {
    const queryBus = new QueryBusStub(async (query) => {
      if (query instanceof GetTelemetryDashboardTimeseriesQuery) {
        return {
          interval: "day",
          buckets: [],
        };
      }
      if (query instanceof GetTelemetryDashboardDimensionsQuery) {
        return {
          modelNames: ["gpt-4o-mini"],
        };
      }
      if (query instanceof GetTelemetryDashboardRunsQuery) {
        return {
          items: [],
          totalCount: 0,
          page: 2,
          pageSize: 5,
        };
      }
      throw new Error("Unexpected query type");
    });
    const handler = new TelemetryHttpRouteHandler(queryBus);
    const factory = new TelemetryHttpRouteHandlerTestRequestFactory();

    const timeseriesResponse = await handler.getDashboardTimeseries(
      factory.create(
        "/api/telemetry/dashboard/timeseries?interval=day&workflowId=wf-a&status=failed&modelName=gpt-4.1-mini&startTimeGte=2026-04-10T00:00:00.000Z&endTimeLte=2026-04-11T00:00:00.000Z",
      ),
    );
    const dimensionsResponse = await handler.getDashboardDimensions(
      factory.create("/api/telemetry/dashboard/dimensions?workflowId=wf-a&status=failed"),
    );
    const runsResponse = await handler.getDashboardRuns(
      factory.create("/api/telemetry/dashboard/runs?page=2&pageSize=5&workflowId=wf-a&status=failed&runOrigin=manual"),
    );

    expect(timeseriesResponse.status).toBe(200);
    expect(dimensionsResponse.status).toBe(200);
    expect(runsResponse.status).toBe(200);
    expect(queryBus.executedQueries[0]).toBeInstanceOf(GetTelemetryDashboardTimeseriesQuery);
    expect((queryBus.executedQueries[0] as GetTelemetryDashboardTimeseriesQuery).request).toEqual({
      interval: "day",
      filters: {
        workflowIds: ["wf-a"],
        statuses: ["failed"],
        runOrigins: undefined,
        modelNames: ["gpt-4.1-mini"],
        startTimeGte: "2026-04-10T00:00:00.000Z",
        endTimeLte: "2026-04-11T00:00:00.000Z",
      },
    });
    expect(queryBus.executedQueries[1]).toBeInstanceOf(GetTelemetryDashboardDimensionsQuery);
    expect((queryBus.executedQueries[1] as GetTelemetryDashboardDimensionsQuery).filters).toEqual({
      workflowIds: ["wf-a"],
      statuses: ["failed"],
      runOrigins: undefined,
      modelNames: undefined,
      startTimeGte: undefined,
      endTimeLte: undefined,
    });
    expect(queryBus.executedQueries[2]).toBeInstanceOf(GetTelemetryDashboardRunsQuery);
    expect((queryBus.executedQueries[2] as GetTelemetryDashboardRunsQuery).request).toEqual({
      filters: {
        workflowIds: ["wf-a"],
        statuses: ["failed"],
        runOrigins: ["manual"],
        modelNames: undefined,
        startTimeGte: undefined,
        endTimeLte: undefined,
      },
      page: 2,
      pageSize: 5,
    });
  });

  it("returns 400 for unsupported status, invalid iso values, and invalid intervals", async () => {
    const handler = new TelemetryHttpRouteHandler(new QueryBusStub(async () => ({ ok: true })));
    const factory = new TelemetryHttpRouteHandlerTestRequestFactory();

    const invalidStatus = await handler.getDashboardSummary(
      factory.create("/api/telemetry/dashboard/summary?status=paused"),
    );
    const invalidIso = await handler.getDashboardSummary(
      factory.create("/api/telemetry/dashboard/summary?startTimeGte=not-a-date"),
    );
    const invalidInterval = await handler.getDashboardTimeseries(
      factory.create("/api/telemetry/dashboard/timeseries?interval=month"),
    );
    const invalidPage = await handler.getDashboardRuns(factory.create("/api/telemetry/dashboard/runs?page=0"));

    expect(invalidStatus.status).toBe(400);
    await expect(invalidStatus.json()).resolves.toEqual({
      error: "Unsupported telemetry status filter: paused",
    });
    expect(invalidIso.status).toBe(400);
    await expect(invalidIso.json()).resolves.toEqual({
      error: "Invalid ISO timestamp for startTimeGte.",
    });
    expect(invalidInterval.status).toBe(400);
    await expect(invalidInterval.json()).resolves.toEqual({
      error: "Query string must include interval=minute_5|minute_15|hour|day|week.",
    });
    expect(invalidPage.status).toBe(400);
    await expect(invalidPage.json()).resolves.toEqual({
      error: "page must be a positive integer.",
    });
  });

  it("returns a 500 response when the query bus throws an unexpected error", async () => {
    console.error = () => undefined;
    const handler = new TelemetryHttpRouteHandler(
      new QueryBusStub(async () => {
        throw new Error("boom");
      }),
    );

    const response = await handler.getDashboardSummary(
      new TelemetryHttpRouteHandlerTestRequestFactory().create("/api/telemetry/dashboard/summary"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "boom" });
  });
});
