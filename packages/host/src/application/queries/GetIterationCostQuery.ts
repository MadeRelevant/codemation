import { Query } from "../bus/Query";
import type { IterationCostRollupDto } from "../contracts/IterationCostContracts";

/**
 * Query that returns a per-iteration cost rollup for a single run.
 *
 * The rollup is keyed by `iterationId` and contains the sum of
 * `codemation.cost.estimated` metric points grouped by ISO currency code.
 */
export class GetIterationCostQuery extends Query<ReadonlyArray<IterationCostRollupDto>> {
  constructor(public readonly runId: string) {
    super();
  }
}
