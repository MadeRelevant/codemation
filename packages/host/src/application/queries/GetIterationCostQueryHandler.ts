import { CostTrackingTelemetryAttributeNames, CostTrackingTelemetryMetricNames, inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { TelemetryMetricPointRecord, TelemetryMetricPointStore } from "../../domain/telemetry/TelemetryContracts";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import type { IterationCostRollupDto } from "../contracts/IterationCostContracts";
import { GetIterationCostQuery } from "./GetIterationCostQuery";

interface MutableCostBucket {
  readonly iterationId: string;
  readonly estimatedCostMinorByCurrency: Record<string, number>;
  readonly estimatedCostCurrencyScaleByCurrency: Record<string, number>;
}

@HandlesQuery.for(GetIterationCostQuery)
export class GetIterationCostQueryHandler extends QueryHandler<
  GetIterationCostQuery,
  ReadonlyArray<IterationCostRollupDto>
> {
  constructor(
    @inject(ApplicationTokens.TelemetryMetricPointStore)
    private readonly metricPointStore: TelemetryMetricPointStore,
  ) {
    super();
  }

  async execute(query: GetIterationCostQuery): Promise<ReadonlyArray<IterationCostRollupDto>> {
    const points = await this.metricPointStore.list({
      runId: query.runId,
      metricNames: [CostTrackingTelemetryMetricNames.estimatedCost],
    });
    if (points.length === 0) {
      return [];
    }
    const buckets = new Map<string, MutableCostBucket>();
    for (const point of points) {
      this.accumulate(point, buckets);
    }
    return [...buckets.values()].map((bucket) => ({
      iterationId: bucket.iterationId,
      estimatedCostMinorByCurrency: { ...bucket.estimatedCostMinorByCurrency },
      estimatedCostCurrencyScaleByCurrency: { ...bucket.estimatedCostCurrencyScaleByCurrency },
    }));
  }

  private accumulate(point: TelemetryMetricPointRecord, buckets: Map<string, MutableCostBucket>): void {
    const iterationId = point.iterationId;
    if (!iterationId || iterationId.length === 0) {
      return;
    }
    const currency = this.readCurrency(point);
    if (!currency) {
      return;
    }
    const currencyScale = this.readCurrencyScale(point);
    const bucket = this.bucketFor(iterationId, buckets);
    bucket.estimatedCostMinorByCurrency[currency] = (bucket.estimatedCostMinorByCurrency[currency] ?? 0) + point.value;
    if (typeof currencyScale === "number") {
      bucket.estimatedCostCurrencyScaleByCurrency[currency] = currencyScale;
    }
  }

  private bucketFor(iterationId: string, buckets: Map<string, MutableCostBucket>): MutableCostBucket {
    const existing = buckets.get(iterationId);
    if (existing) {
      return existing;
    }
    const bucket: MutableCostBucket = {
      iterationId,
      estimatedCostMinorByCurrency: {},
      estimatedCostCurrencyScaleByCurrency: {},
    };
    buckets.set(iterationId, bucket);
    return bucket;
  }

  private readCurrency(point: TelemetryMetricPointRecord): string | undefined {
    const fromAttribute = point.dimensions?.[CostTrackingTelemetryAttributeNames.currency];
    if (typeof fromAttribute === "string" && fromAttribute.length > 0) {
      return fromAttribute;
    }
    if (typeof point.unit === "string" && point.unit.length > 0) {
      return point.unit;
    }
    return undefined;
  }

  private readCurrencyScale(point: TelemetryMetricPointRecord): number | undefined {
    const value = point.dimensions?.[CostTrackingTelemetryAttributeNames.currencyScale];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }
}
