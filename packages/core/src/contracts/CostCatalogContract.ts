import type { CostTrackingUsageRecord } from "./CostTrackingTelemetryContract";

export interface CostCatalogEntry {
  readonly component: CostTrackingUsageRecord["component"];
  readonly provider: string;
  readonly operation: string;
  readonly pricingKey: string;
  readonly usageUnit: string;
  readonly currency: string;
  readonly currencyScale: number;
  readonly pricePerUnitMinor: number;
}

export interface CostCatalog {
  findEntry(args: CostTrackingUsageRecord): CostCatalogEntry | undefined;
}
