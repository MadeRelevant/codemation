import { inject } from "@codemation/core";
import type { TelemetryDashboardSummaryDto } from "../contracts/TelemetryDashboardContracts";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { TelemetryQueryService } from "../telemetry/TelemetryQueryService";
import { GetTelemetryDashboardSummaryQuery } from "./GetTelemetryDashboardSummaryQuery";

@HandlesQuery.for(GetTelemetryDashboardSummaryQuery)
export class GetTelemetryDashboardSummaryQueryHandler extends QueryHandler<
  GetTelemetryDashboardSummaryQuery,
  TelemetryDashboardSummaryDto
> {
  constructor(@inject(TelemetryQueryService) private readonly telemetryQueryService: TelemetryQueryService) {
    super();
  }

  async execute(query: GetTelemetryDashboardSummaryQuery): Promise<TelemetryDashboardSummaryDto> {
    const [runs, ai, costs] = await Promise.all([
      this.telemetryQueryService.summarizeRuns(query.filters),
      this.telemetryQueryService.summarizeAiUsage(query.filters),
      this.telemetryQueryService.summarizeCosts(query.filters),
    ]);
    return {
      runs,
      ai,
      costs,
    };
  }
}
