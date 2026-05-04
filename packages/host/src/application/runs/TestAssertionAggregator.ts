import { inject, injectable, type WorkflowId } from "@codemation/core";

import type { TestAssertionRepository } from "../../domain/runs/TestAssertionRepository";
import type { TestSuiteRunRepository } from "../../domain/runs/TestSuiteRunRepository";
import type {
  AssertionMetricTrendDto,
  AssertionMetricTrendPointDto,
} from "../contracts/TestingContracts";

import { TestAssertionRepositoryToken, TestSuiteRunRepositoryToken } from "./TestSuiteRunTrackerFactory";

/**
 * Computes the per-suite-run mean-score trend for one workflow's recorded assertion metrics.
 * Joins the {@link TestAssertionRepository}'s `(testSuiteRunId, name) → mean(score)` aggregation
 * with the {@link TestSuiteRunRepository}'s `startedAt` so the chart can plot points on a real
 * time axis without a second round-trip from the UI.
 *
 * Behaviour:
 *   - With no `names` filter, returns one entry per distinct assertion name on the workflow
 *     (so the UI can populate the multi-select dropdown). Names with zero assertion rows
 *     persisted yet appear with an empty `perSuiteRun` array.
 *   - With a `names` filter, returns one entry per *requested* name (preserving caller order),
 *     with `perSuiteRun` populated for whichever ones have data.
 *   - Every returned `perSuiteRun` array is sorted oldest → newest by `startedAt`.
 */
@injectable()
export class TestAssertionAggregator {
  constructor(
    @inject(TestAssertionRepositoryToken) private readonly assertionRepo: TestAssertionRepository,
    @inject(TestSuiteRunRepositoryToken) private readonly suiteRepo: TestSuiteRunRepository,
  ) {}

  async getAssertionMetricTrends(args: {
    readonly workflowId: WorkflowId;
    readonly names?: ReadonlyArray<string>;
  }): Promise<ReadonlyArray<AssertionMetricTrendDto>> {
    const filterNames =
      args.names && args.names.length > 0 ? args.names.filter((n) => n.trim().length > 0) : undefined;

    const [aggregations, suiteRuns, distinctNames] = await Promise.all([
      this.assertionRepo.aggregateMeanScoreByNameAndSuiteRun({
        workflowId: args.workflowId,
        ...(filterNames ? { names: filterNames } : {}),
      }),
      this.suiteRepo.listByWorkflow({ workflowId: args.workflowId }),
      filterNames ? Promise.resolve(filterNames) : this.assertionRepo.listDistinctNamesByWorkflow(args.workflowId),
    ]);

    const startedAtById = new Map<string, string>();
    for (const suite of suiteRuns) {
      startedAtById.set(suite.id, suite.startedAt);
    }

    const pointsByName = new Map<string, AssertionMetricTrendPointDto[]>();
    for (const agg of aggregations) {
      const startedAt = startedAtById.get(agg.testSuiteRunId);
      // Skip aggregation rows whose suite-run no longer exists (race with a concurrent delete).
      if (startedAt === undefined) continue;
      const list = pointsByName.get(agg.name);
      const point: AssertionMetricTrendPointDto = {
        testSuiteRunId: agg.testSuiteRunId,
        startedAt,
        meanScore: agg.meanScore,
        sampleCount: agg.sampleCount,
      };
      if (list) {
        list.push(point);
      } else {
        pointsByName.set(agg.name, [point]);
      }
    }

    for (const points of pointsByName.values()) {
      points.sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
    }

    // Use the requested order when names were filtered (UI relies on order to pick line colors);
    // otherwise return the alphabetical order of distinct names from the repo.
    const orderedNames = filterNames ? filterNames : distinctNames;
    const seen = new Set<string>();
    const result: AssertionMetricTrendDto[] = [];
    for (const name of orderedNames) {
      if (seen.has(name)) continue;
      seen.add(name);
      result.push({
        name,
        perSuiteRun: pointsByName.get(name) ?? [],
      });
    }
    return result;
  }
}
