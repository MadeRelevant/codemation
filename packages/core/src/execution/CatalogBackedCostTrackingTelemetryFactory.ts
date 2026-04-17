import type { CostCatalog } from "../contracts/CostCatalogContract";
import type { CostTrackingTelemetry, CostTrackingTelemetryFactory } from "../contracts/CostTrackingTelemetryContract";
import type { ExecutionTelemetry } from "../contracts/telemetryTypes";
import { CatalogBackedCostTrackingTelemetry } from "./CatalogBackedCostTrackingTelemetry";

export class CatalogBackedCostTrackingTelemetryFactory implements CostTrackingTelemetryFactory {
  constructor(private readonly costCatalog: CostCatalog) {}

  create(args: Readonly<{ telemetry: ExecutionTelemetry }>): CostTrackingTelemetry {
    return new CatalogBackedCostTrackingTelemetry(args.telemetry, this.costCatalog);
  }
}
