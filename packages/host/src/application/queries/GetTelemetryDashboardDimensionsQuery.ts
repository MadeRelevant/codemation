import type {
  TelemetryDashboardDimensionsDto,
  TelemetryDashboardFiltersDto,
} from "../contracts/TelemetryDashboardContracts";
import { Query } from "../bus/Query";

export class GetTelemetryDashboardDimensionsQuery extends Query<TelemetryDashboardDimensionsDto> {
  constructor(public readonly filters: TelemetryDashboardFiltersDto) {
    super();
  }
}
