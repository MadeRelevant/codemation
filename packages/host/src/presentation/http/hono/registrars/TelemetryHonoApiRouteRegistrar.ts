import { inject, injectable } from "@codemation/core";
import { Hono } from "hono";
import { TelemetryHttpRouteHandler } from "../../routeHandlers/TelemetryHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
export class TelemetryHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(TelemetryHttpRouteHandler) private readonly handler: TelemetryHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/telemetry/dashboard/summary", (c) => this.handler.getDashboardSummary(c.req.raw));
    app.get("/telemetry/dashboard/timeseries", (c) => this.handler.getDashboardTimeseries(c.req.raw));
    app.get("/telemetry/dashboard/dimensions", (c) => this.handler.getDashboardDimensions(c.req.raw));
    app.get("/telemetry/dashboard/runs", (c) => this.handler.getDashboardRuns(c.req.raw));
    app.get("/telemetry/runs/:runId/trace", (c) => this.handler.getRunTrace(c.req.param("runId")));
  }
}
