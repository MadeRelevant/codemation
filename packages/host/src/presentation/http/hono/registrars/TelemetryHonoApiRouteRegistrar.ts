import { inject, injectable, registry } from "@codemation/core";
import { Hono } from "hono";
import { ApplicationTokens } from "../../../../applicationTokens";
import { TelemetryHttpRouteHandler } from "../../routeHandlers/TelemetryHttpRouteHandler";
import type { HonoApiRouteRegistrar } from "../HonoApiRouteRegistrar";

@injectable()
@registry([{ token: ApplicationTokens.HonoApiRouteRegistrar, useClass: TelemetryHonoApiRouteRegistrar }])
export class TelemetryHonoApiRouteRegistrar implements HonoApiRouteRegistrar {
  constructor(@inject(TelemetryHttpRouteHandler) private readonly handler: TelemetryHttpRouteHandler) {}

  register(app: Hono): void {
    app.get("/telemetry/dashboard/summary", (c) => this.handler.getDashboardSummary(c.req.raw));
    app.get("/telemetry/dashboard/timeseries", (c) => this.handler.getDashboardTimeseries(c.req.raw));
    app.get("/telemetry/dashboard/dimensions", (c) => this.handler.getDashboardDimensions(c.req.raw));
  }
}
