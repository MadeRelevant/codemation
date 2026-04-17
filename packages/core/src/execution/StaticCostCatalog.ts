import type { CostCatalog, CostCatalogEntry } from "../contracts/CostCatalogContract";
import type { CostTrackingUsageRecord } from "../contracts/CostTrackingTelemetryContract";

export class StaticCostCatalog implements CostCatalog {
  private readonly entriesByKey: ReadonlyMap<string, CostCatalogEntry>;

  constructor(entries: ReadonlyArray<CostCatalogEntry>) {
    this.entriesByKey = new Map(entries.map((entry) => [this.createKeyFromEntry(entry), entry]));
  }

  findEntry(args: CostTrackingUsageRecord): CostCatalogEntry | undefined {
    return this.entriesByKey.get(this.createKeyFromUsage(args));
  }

  private createKeyFromEntry(entry: CostCatalogEntry): string {
    return `${entry.component}::${entry.provider}::${entry.operation}::${entry.pricingKey}::${entry.usageUnit}`;
  }

  private createKeyFromUsage(args: CostTrackingUsageRecord): string {
    return `${args.component}::${args.provider}::${args.operation}::${args.pricingKey}::${args.usageUnit}`;
  }
}
