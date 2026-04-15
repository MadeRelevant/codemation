import { inject } from "@codemation/core";
import type { TelemetryRunTraceViewDto } from "../contracts/TelemetryRunTraceContracts";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { TelemetryQueryService } from "../telemetry/TelemetryQueryService";
import { GetTelemetryRunTraceQuery } from "./GetTelemetryRunTraceQuery";

@HandlesQuery.for(GetTelemetryRunTraceQuery)
export class GetTelemetryRunTraceQueryHandler extends QueryHandler<
  GetTelemetryRunTraceQuery,
  TelemetryRunTraceViewDto
> {
  constructor(@inject(TelemetryQueryService) private readonly telemetryQueryService: TelemetryQueryService) {
    super();
  }

  async execute(query: GetTelemetryRunTraceQuery): Promise<TelemetryRunTraceViewDto> {
    return await this.telemetryQueryService.loadRunTrace(query.runId);
  }
}
