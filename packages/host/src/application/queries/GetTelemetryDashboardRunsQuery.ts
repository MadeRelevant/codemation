import type {
  TelemetryDashboardRunsDto,
  TelemetryDashboardRunsRequestDto,
} from "../contracts/TelemetryDashboardContracts";
import { Query } from "../bus/Query";

export class GetTelemetryDashboardRunsQuery extends Query<TelemetryDashboardRunsDto> {
  constructor(public readonly request: TelemetryDashboardRunsRequestDto) {
    super();
  }
}
