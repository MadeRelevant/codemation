import { inject } from "@codemation/core";
import type { TelemetryDashboardRunsDto } from "../contracts/TelemetryDashboardContracts";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { TelemetryQueryService } from "../telemetry/TelemetryQueryService";
import { GetTelemetryDashboardRunsQuery } from "./GetTelemetryDashboardRunsQuery";

@HandlesQuery.for(GetTelemetryDashboardRunsQuery)
export class GetTelemetryDashboardRunsQueryHandler extends QueryHandler<
  GetTelemetryDashboardRunsQuery,
  TelemetryDashboardRunsDto
> {
  constructor(@inject(TelemetryQueryService) private readonly telemetryQueryService: TelemetryQueryService) {
    super();
  }

  async execute(query: GetTelemetryDashboardRunsQuery): Promise<TelemetryDashboardRunsDto> {
    return await this.telemetryQueryService.listRuns(query.request);
  }
}
