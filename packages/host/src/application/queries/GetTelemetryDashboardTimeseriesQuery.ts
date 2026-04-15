import type {
  TelemetryDashboardTimeseriesDto,
  TelemetryDashboardTimeseriesRequestDto,
} from "../contracts/TelemetryDashboardContracts";
import { Query } from "../bus/Query";

export class GetTelemetryDashboardTimeseriesQuery extends Query<TelemetryDashboardTimeseriesDto> {
  constructor(public readonly request: TelemetryDashboardTimeseriesRequestDto) {
    super();
  }
}
