import type { ExecutionTelemetry } from "./telemetryTypes";
import type { TelemetryAttributes, TelemetryScope } from "./telemetryTypes";

export type CostTrackingComponent = "chat" | "ocr" | "rag";

export const CostTrackingTelemetryMetricNames = {
  usage: "codemation.cost.usage",
  estimatedCost: "codemation.cost.estimated",
} as const;

export const CostTrackingTelemetryAttributeNames = {
  component: "cost.component",
  provider: "cost.provider",
  operation: "cost.operation",
  pricingKey: "cost.pricing_key",
  usageUnit: "cost.usage_unit",
  currency: "cost.currency",
  currencyScale: "cost.currency_scale",
  estimateKind: "cost.estimate_kind",
} as const;

export interface CostTrackingUsageRecord {
  readonly component: CostTrackingComponent;
  readonly provider: string;
  readonly operation: string;
  readonly pricingKey: string;
  readonly usageUnit: string;
  readonly quantity: number;
  readonly modelName?: string;
  readonly attributes?: TelemetryAttributes;
}

export interface CostTrackingPriceQuote {
  readonly currency: string;
  readonly currencyScale: number;
  readonly estimatedAmountMinor: number;
  readonly estimateKind: "catalog";
}

export interface CostTrackingTelemetry {
  captureUsage(args: CostTrackingUsageRecord): Promise<CostTrackingPriceQuote | undefined>;
  forScope(scope: TelemetryScope): CostTrackingTelemetry;
}

export interface CostTrackingTelemetryFactory {
  create(args: Readonly<{ telemetry: ExecutionTelemetry }>): CostTrackingTelemetry;
}
