import type { CostCatalog } from "../contracts/CostCatalogContract";
import {
  CostTrackingTelemetryAttributeNames,
  CostTrackingTelemetryMetricNames,
  type CostTrackingPriceQuote,
  type CostTrackingTelemetry,
  type CostTrackingUsageRecord,
} from "../contracts/CostTrackingTelemetryContract";
import type { TelemetryAttributes, TelemetryScope } from "../types";

export class CatalogBackedCostTrackingTelemetry implements CostTrackingTelemetry {
  constructor(
    private readonly currentScope: TelemetryScope,
    private readonly costCatalog: CostCatalog,
  ) {}

  async captureUsage(args: CostTrackingUsageRecord): Promise<CostTrackingPriceQuote | undefined> {
    const usageAttributes = this.createUsageAttributes(args);
    await this.currentScope.recordMetric({
      name: CostTrackingTelemetryMetricNames.usage,
      value: args.quantity,
      unit: args.usageUnit,
      attributes: usageAttributes,
    });

    const catalogEntry = this.costCatalog.findEntry(args);
    if (!catalogEntry) {
      return undefined;
    }

    const estimatedAmountMinor = Math.round(args.quantity * catalogEntry.pricePerUnitMinor);
    const costAttributes = this.createCostAttributes(args, catalogEntry.currency, catalogEntry.currencyScale);
    await this.currentScope.recordMetric({
      name: CostTrackingTelemetryMetricNames.estimatedCost,
      value: estimatedAmountMinor,
      unit: catalogEntry.currency,
      attributes: costAttributes,
    });

    return {
      currency: catalogEntry.currency,
      currencyScale: catalogEntry.currencyScale,
      estimatedAmountMinor,
      estimateKind: "catalog",
    };
  }

  forScope(scope: TelemetryScope): CostTrackingTelemetry {
    // eslint-disable-next-line codemation/no-manual-di-new
    return new CatalogBackedCostTrackingTelemetry(scope, this.costCatalog);
  }

  private createUsageAttributes(args: CostTrackingUsageRecord): TelemetryAttributes {
    return {
      ...args.attributes,
      [CostTrackingTelemetryAttributeNames.component]: args.component,
      [CostTrackingTelemetryAttributeNames.provider]: args.provider,
      [CostTrackingTelemetryAttributeNames.operation]: args.operation,
      [CostTrackingTelemetryAttributeNames.pricingKey]: args.pricingKey,
      [CostTrackingTelemetryAttributeNames.usageUnit]: args.usageUnit,
    };
  }

  private createCostAttributes(
    args: CostTrackingUsageRecord,
    currency: string,
    currencyScale: number,
  ): TelemetryAttributes {
    return {
      ...args.attributes,
      [CostTrackingTelemetryAttributeNames.component]: args.component,
      [CostTrackingTelemetryAttributeNames.provider]: args.provider,
      [CostTrackingTelemetryAttributeNames.operation]: args.operation,
      [CostTrackingTelemetryAttributeNames.pricingKey]: args.pricingKey,
      [CostTrackingTelemetryAttributeNames.usageUnit]: args.usageUnit,
      [CostTrackingTelemetryAttributeNames.currency]: currency,
      [CostTrackingTelemetryAttributeNames.currencyScale]: currencyScale,
      [CostTrackingTelemetryAttributeNames.estimateKind]: "catalog",
    };
  }
}
