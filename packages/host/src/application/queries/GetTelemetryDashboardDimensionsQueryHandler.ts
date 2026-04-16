import { inject } from "@codemation/core";
import type { TelemetryDashboardDimensionsDto } from "../contracts/TelemetryDashboardContracts";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { TelemetryQueryService } from "../telemetry/TelemetryQueryService";
import { GetTelemetryDashboardDimensionsQuery } from "./GetTelemetryDashboardDimensionsQuery";

@HandlesQuery.for(GetTelemetryDashboardDimensionsQuery)
export class GetTelemetryDashboardDimensionsQueryHandler extends QueryHandler<
  GetTelemetryDashboardDimensionsQuery,
  TelemetryDashboardDimensionsDto
> {
  constructor(@inject(TelemetryQueryService) private readonly telemetryQueryService: TelemetryQueryService) {
    super();
  }

  async execute(query: GetTelemetryDashboardDimensionsQuery): Promise<TelemetryDashboardDimensionsDto> {
    return await this.telemetryQueryService.listModelNames(query.filters);
  }
}
