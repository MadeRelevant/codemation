import type { TelemetryRunTraceViewDto } from "../contracts/TelemetryRunTraceContracts";
import { Query } from "../bus/Query";

export class GetTelemetryRunTraceQuery extends Query<TelemetryRunTraceViewDto> {
  constructor(public readonly runId: string) {
    super();
  }
}
