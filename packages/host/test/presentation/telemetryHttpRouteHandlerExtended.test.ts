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

function makeRequest(pathAndQuery: string): Request {
  return new Request(`http://localhost${pathAndQuery}`);
}

describe("TelemetryHttpRouteHandler — additional method coverage", () => {
  const priorConsoleError = console.error;

  afterEach(() => {
    console.error = priorConsoleError;
  });

  describe("getDashboardTimeseries", () => {
    it("returns 200 for all valid intervals", async () => {
      const queryBus = new QueryBusStub(async () => ({ interval: "hour", buckets: [] }));
      const handler = new TelemetryHttpRouteHandler(queryBus);
      for (const interval of ["minute_5", "minute_15", "hour", "day", "week"]) {
        const response = await handler.getDashboardTimeseries(
          makeRequest(`/api/telemetry/dashboard/timeseries?interval=${interval}`),
        );
        expect(response.status).toBe(200);
      }
    });

    it("returns 400 for invalid interval", async () => {
      const handler = new TelemetryHttpRouteHandler(new QueryBusStub(async () => ({})));
      const response = await handler.getDashboardTimeseries(
        makeRequest("/api/telemetry/dashboard/timeseries?interval=month"),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("interval=") });
    });

    it("returns 500 for unexpected error", async () => {
      console.error = () => undefined;
      const handler = new TelemetryHttpRouteHandler(
        new QueryBusStub(async () => {
          throw new Error("db-error");
        }),
      );
      const response = await handler.getDashboardTimeseries(
        makeRequest("/api/telemetry/dashboard/timeseries?interval=day"),
      );
      expect(response.status).toBe(500);
    });

    it("passes all filters to the timeseries query", async () => {
      const queryBus = new QueryBusStub(async () => ({ interval: "day", buckets: [] }));
      const handler = new TelemetryHttpRouteHandler(queryBus);
      await handler.getDashboardTimeseries(
        makeRequest("/api/telemetry/dashboard/timeseries?interval=day&workflowId=wf-a&status=failed&runOrigin=manual"),
      );
      expect(queryBus.executedQueries[0]).toBeInstanceOf(GetTelemetryDashboardTimeseriesQuery);
      const query = queryBus.executedQueries[0] as GetTelemetryDashboardTimeseriesQuery;
      expect(query.request.interval).toBe("day");
      expect(query.request.filters.workflowIds).toEqual(["wf-a"]);
      expect(query.request.filters.statuses).toEqual(["failed"]);
      expect(query.request.filters.runOrigins).toEqual(["manual"]);
    });
  });

  describe("getDashboardDimensions", () => {
    it("returns 200 for a valid request", async () => {
      const queryBus = new QueryBusStub(async () => ({ modelNames: ["gpt-4o"] }));
      const handler = new TelemetryHttpRouteHandler(queryBus);
      const response = await handler.getDashboardDimensions(makeRequest("/api/telemetry/dashboard/dimensions"));
      expect(response.status).toBe(200);
      expect(queryBus.executedQueries[0]).toBeInstanceOf(GetTelemetryDashboardDimensionsQuery);
    });

    it("returns 400 for an unsupported status filter", async () => {
      const handler = new TelemetryHttpRouteHandler(new QueryBusStub(async () => ({})));
      const response = await handler.getDashboardDimensions(
        makeRequest("/api/telemetry/dashboard/dimensions?status=paused"),
      );
      expect(response.status).toBe(400);
    });

    it("returns 500 for unexpected error", async () => {
      console.error = () => undefined;
      const handler = new TelemetryHttpRouteHandler(
        new QueryBusStub(async () => {
          throw new Error("db-error");
        }),
      );
      const response = await handler.getDashboardDimensions(makeRequest("/api/telemetry/dashboard/dimensions"));
      expect(response.status).toBe(500);
    });
  });

  describe("getDashboardRuns", () => {
    it("returns 200 with default page and pageSize", async () => {
      const queryBus = new QueryBusStub(async () => ({ items: [], totalCount: 0, page: 1, pageSize: 10 }));
      const handler = new TelemetryHttpRouteHandler(queryBus);
      const response = await handler.getDashboardRuns(makeRequest("/api/telemetry/dashboard/runs"));
      expect(response.status).toBe(200);
      const query = queryBus.executedQueries[0] as GetTelemetryDashboardRunsQuery;
      expect(query.request.page).toBe(1);
      expect(query.request.pageSize).toBe(10);
    });

    it("passes custom page and pageSize", async () => {
      const queryBus = new QueryBusStub(async () => ({ items: [], totalCount: 0, page: 3, pageSize: 25 }));
      const handler = new TelemetryHttpRouteHandler(queryBus);
      await handler.getDashboardRuns(makeRequest("/api/telemetry/dashboard/runs?page=3&pageSize=25"));
      const query = queryBus.executedQueries[0] as GetTelemetryDashboardRunsQuery;
      expect(query.request.page).toBe(3);
      expect(query.request.pageSize).toBe(25);
    });

    it("returns 400 for non-positive page", async () => {
      const handler = new TelemetryHttpRouteHandler(new QueryBusStub(async () => ({})));
      const response = await handler.getDashboardRuns(makeRequest("/api/telemetry/dashboard/runs?page=0"));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "page must be a positive integer." });
    });

    it("returns 400 for non-integer pageSize", async () => {
      const handler = new TelemetryHttpRouteHandler(new QueryBusStub(async () => ({})));
      const response = await handler.getDashboardRuns(makeRequest("/api/telemetry/dashboard/runs?pageSize=abc"));
      expect(response.status).toBe(400);
    });

    it("returns 500 for unexpected error", async () => {
      console.error = () => undefined;
      const handler = new TelemetryHttpRouteHandler(
        new QueryBusStub(async () => {
          throw new Error("db-error");
        }),
      );
      const response = await handler.getDashboardRuns(makeRequest("/api/telemetry/dashboard/runs"));
      expect(response.status).toBe(500);
    });

    it("returns 400 for invalid runOrigin filter", async () => {
      const handler = new TelemetryHttpRouteHandler(new QueryBusStub(async () => ({})));
      const response = await handler.getDashboardRuns(makeRequest("/api/telemetry/dashboard/runs?runOrigin=unknown"));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "Unsupported telemetry run origin filter: unknown",
      });
    });
  });

  describe("getDashboardSummary", () => {
    it("returns 200 for a valid filter set", async () => {
      const queryBus = new QueryBusStub(async () => ({ runs: { totalRuns: 1 }, ai: {}, costs: {} }));
      const handler = new TelemetryHttpRouteHandler(queryBus);
      const response = await handler.getDashboardSummary(
        makeRequest("/api/telemetry/dashboard/summary?workflowId=wf-a&status=completed&runOrigin=triggered"),
      );
      expect(response.status).toBe(200);
      expect(queryBus.executedQueries[0]).toBeInstanceOf(GetTelemetryDashboardSummaryQuery);
    });

    it("returns 400 for invalid ISO timestamp", async () => {
      const handler = new TelemetryHttpRouteHandler(new QueryBusStub(async () => ({})));
      const response = await handler.getDashboardSummary(
        makeRequest("/api/telemetry/dashboard/summary?endTimeLte=not-a-date"),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "Invalid ISO timestamp for endTimeLte." });
    });
  });
});
