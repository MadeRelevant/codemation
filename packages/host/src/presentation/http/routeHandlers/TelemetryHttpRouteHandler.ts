import { inject, injectable } from "@codemation/core";
import type {
  TelemetryDashboardFiltersDto,
  TelemetryDashboardTimeseriesRequestDto,
} from "../../../application/contracts/TelemetryDashboardContracts";
import type { QueryBus } from "../../../application/bus/QueryBus";
import { GetTelemetryDashboardDimensionsQuery } from "../../../application/queries/GetTelemetryDashboardDimensionsQuery";
import { GetTelemetryDashboardSummaryQuery } from "../../../application/queries/GetTelemetryDashboardSummaryQuery";
import { GetTelemetryDashboardTimeseriesQuery } from "../../../application/queries/GetTelemetryDashboardTimeseriesQuery";
import { ApplicationTokens } from "../../../applicationTokens";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import { TelemetryDashboardRequestError } from "./TelemetryDashboardRequestError";

@injectable()
export class TelemetryHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
  ) {}

  async getDashboardSummary(request: Request): Promise<Response> {
    try {
      const filters = this.parseFilters(request);
      return Response.json(await this.queryBus.execute(new GetTelemetryDashboardSummaryQuery(filters)));
    } catch (error) {
      if (error instanceof TelemetryDashboardRequestError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getDashboardTimeseries(request: Request): Promise<Response> {
    try {
      const parsed = this.parseTimeseriesRequest(request);
      return Response.json(await this.queryBus.execute(new GetTelemetryDashboardTimeseriesQuery(parsed)));
    } catch (error) {
      if (error instanceof TelemetryDashboardRequestError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getDashboardDimensions(request: Request): Promise<Response> {
    try {
      const filters = this.parseFilters(request);
      return Response.json(await this.queryBus.execute(new GetTelemetryDashboardDimensionsQuery(filters)));
    } catch (error) {
      if (error instanceof TelemetryDashboardRequestError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  private parseTimeseriesRequest(request: Request): TelemetryDashboardTimeseriesRequestDto {
    const url = new URL(request.url);
    const interval = url.searchParams.get("interval");
    if (interval !== "hour" && interval !== "day" && interval !== "week") {
      throw new TelemetryDashboardRequestError("Query string must include interval=hour|day|week.");
    }
    return {
      interval,
      filters: this.parseFilters(request),
    };
  }

  private parseFilters(request: Request): TelemetryDashboardFiltersDto {
    const url = new URL(request.url);
    return {
      workflowIds: this.readMany(url, "workflowId"),
      statuses: this.readStatuses(url),
      modelNames: this.readMany(url, "modelName"),
      startTimeGte: this.readIso(url, "startTimeGte"),
      endTimeLte: this.readIso(url, "endTimeLte"),
    };
  }

  private readMany(url: URL, key: string): ReadonlyArray<string> | undefined {
    const values = url.searchParams
      .getAll(key)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return values.length > 0 ? values : undefined;
  }

  private readStatuses(url: URL): TelemetryDashboardFiltersDto["statuses"] {
    const values = this.readMany(url, "status");
    if (!values) {
      return undefined;
    }
    for (const value of values) {
      if (value !== "running" && value !== "completed" && value !== "failed") {
        throw new TelemetryDashboardRequestError(`Unsupported telemetry status filter: ${value}`);
      }
    }
    return values as TelemetryDashboardFiltersDto["statuses"];
  }

  private readIso(url: URL, key: string): string | undefined {
    const value = url.searchParams.get(key)?.trim();
    if (!value) {
      return undefined;
    }
    if (Number.isNaN(new Date(value).getTime())) {
      throw new TelemetryDashboardRequestError(`Invalid ISO timestamp for ${key}.`);
    }
    return value;
  }
}
