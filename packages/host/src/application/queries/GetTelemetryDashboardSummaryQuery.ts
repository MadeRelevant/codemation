import type {
  TelemetryDashboardFiltersDto,
  TelemetryDashboardSummaryDto,
} from "../contracts/TelemetryDashboardContracts";
import { Query } from "../bus/Query";

export class GetTelemetryDashboardSummaryQuery extends Query<TelemetryDashboardSummaryDto> {
  constructor(public readonly filters: TelemetryDashboardFiltersDto) {
    super();
  }
}
