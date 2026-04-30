/**
 * Per-iteration cost rollup, derived from `codemation.cost.estimated` metric points
 * grouped by `iterationId` and currency.
 */
export interface IterationCostRollupDto {
  readonly iterationId: string;
  /** Sum of cost in minor units (per `cost.currency_scale`) keyed by ISO currency code. */
  readonly estimatedCostMinorByCurrency: Readonly<Record<string, number>>;
  /** Currency scale (denominator) per currency, when present on the metric points. */
  readonly estimatedCostCurrencyScaleByCurrency: Readonly<Record<string, number>>;
}
