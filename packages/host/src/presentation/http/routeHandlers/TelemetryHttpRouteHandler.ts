import { inject, injectable } from "@codemation/core";
import type {
  TelemetryDashboardFiltersDto,
  TelemetryDashboardRunsRequestDto,
  TelemetryDashboardTimeseriesRequestDto,
} from "../../../application/contracts/TelemetryDashboardContracts";
import type { QueryBus } from "../../../application/bus/QueryBus";
import { GetTelemetryDashboardDimensionsQuery } from "../../../application/queries/GetTelemetryDashboardDimensionsQuery";
import { GetTelemetryDashboardRunsQuery } from "../../../application/queries/GetTelemetryDashboardRunsQuery";
import { GetTelemetryRunTraceQuery } from "../../../application/queries/GetTelemetryRunTraceQuery";
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

  async getDashboardRuns(request: Request): Promise<Response> {
    try {
      const parsed = this.parseRunsRequest(request);
      return Response.json(await this.queryBus.execute(new GetTelemetryDashboardRunsQuery(parsed)));
    } catch (error) {
      if (error instanceof TelemetryDashboardRequestError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getRunTrace(runId: string): Promise<Response> {
    try {
      if (!runId.trim()) {
        throw new TelemetryDashboardRequestError("Run trace request requires a run id.");
      }
      return Response.json(await this.queryBus.execute(new GetTelemetryRunTraceQuery(runId)));
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
    if (
      interval !== "minute_5" &&
      interval !== "minute_15" &&
      interval !== "hour" &&
      interval !== "day" &&
      interval !== "week"
    ) {
      throw new TelemetryDashboardRequestError("Query string must include interval=minute_5|minute_15|hour|day|week.");
    }
    return {
      interval,
      filters: this.parseFilters(request),
    };
  }

  private parseRunsRequest(request: Request): TelemetryDashboardRunsRequestDto {
    const url = new URL(request.url);
    return {
      filters: this.parseFilters(request),
      page: this.readPositiveInt(url, "page", 1),
      pageSize: this.readPositiveInt(url, "pageSize", 10),
    };
  }

  private parseFilters(request: Request): TelemetryDashboardFiltersDto {
    const url = new URL(request.url);
    return {
      workflowIds: this.readMany(url, "workflowId"),
      statuses: this.readStatuses(url),
      runOrigins: this.readRunOrigins(url),
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

  private readRunOrigins(url: URL): TelemetryDashboardFiltersDto["runOrigins"] {
    const values = this.readMany(url, "runOrigin");
    if (!values) {
      return undefined;
    }
    for (const value of values) {
      if (value !== "triggered" && value !== "manual") {
        throw new TelemetryDashboardRequestError(`Unsupported telemetry run origin filter: ${value}`);
      }
    }
    return values as TelemetryDashboardFiltersDto["runOrigins"];
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

  private readPositiveInt(url: URL, key: string, fallback: number): number {
    const raw = url.searchParams.get(key)?.trim();
    if (!raw) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new TelemetryDashboardRequestError(`${key} must be a positive integer.`);
    }
    return value;
  }
}
