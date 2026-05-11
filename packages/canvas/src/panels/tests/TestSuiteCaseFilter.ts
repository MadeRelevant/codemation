import { deriveAssertionPassed } from "@codemation/core/contracts";
import type { TestAssertionDto, TestSuiteChildRunDto } from "@codemation/host/dto";

import { resolveDisplayedCaseStatus } from "./TestSuiteCaseStatusIcon";

/**
 * Filter modes for the test-suite-detail tree-table. `all` shows every dispatched case,
 * the other modes filter to assertion-rollup outcomes:
 *   - `passing`: case status `succeeded` AND every assertion passes
 *   - `failing`: case status `failed` (assertion-rollup downgrade or workflow failure)
 *   - `errored`: case status `errored` (engine-side throw) OR any assertion has `errored: true`
 *   - `inFlight`: case is still `running` / `queued` (so users can spot stragglers in long suites)
 */
export type TestSuiteCaseFilter = "all" | "passing" | "failing" | "errored" | "inFlight";

interface CaseCounts {
  readonly all: number;
  readonly passing: number;
  readonly failing: number;
  readonly errored: number;
  readonly inFlight: number;
}

export class TestSuiteCaseFilterEngine {
  static apply(
    runs: ReadonlyArray<TestSuiteChildRunDto>,
    assertions: ReadonlyArray<TestAssertionDto>,
    filter: TestSuiteCaseFilter,
  ): ReadonlyArray<TestSuiteChildRunDto> {
    if (filter === "all") return runs;
    const assertionsByRunId = this.groupAssertionsByRun(assertions);
    return runs.filter((run) => this.matches(run, assertionsByRunId.get(run.runId) ?? [], filter));
  }

  static counts(runs: ReadonlyArray<TestSuiteChildRunDto>, assertions: ReadonlyArray<TestAssertionDto>): CaseCounts {
    const assertionsByRunId = this.groupAssertionsByRun(assertions);
    let passing = 0;
    let failing = 0;
    let errored = 0;
    let inFlight = 0;
    for (const run of runs) {
      const runAssertions = assertionsByRunId.get(run.runId) ?? [];
      if (this.matches(run, runAssertions, "errored")) errored += 1;
      else if (this.matches(run, runAssertions, "failing")) failing += 1;
      else if (this.matches(run, runAssertions, "passing")) passing += 1;
      else if (this.matches(run, runAssertions, "inFlight")) inFlight += 1;
    }
    return { all: runs.length, passing, failing, errored, inFlight };
  }

  private static groupAssertionsByRun(
    assertions: ReadonlyArray<TestAssertionDto>,
  ): Map<string, ReadonlyArray<TestAssertionDto>> {
    const map = new Map<string, TestAssertionDto[]>();
    for (const a of assertions) {
      const list = map.get(a.runId) ?? [];
      list.push(a);
      map.set(a.runId, list);
    }
    return map;
  }

  private static matches(
    run: TestSuiteChildRunDto,
    runAssertions: ReadonlyArray<TestAssertionDto>,
    filter: TestSuiteCaseFilter,
  ): boolean {
    const status = resolveDisplayedCaseStatus(run);
    const hasErrored = runAssertions.some((a) => a.errored === true);
    switch (filter) {
      case "errored":
        return status === "errored" || hasErrored;
      case "failing":
        // Don't double-count: cases with errored assertions go in `errored`, not `failing`.
        return status === "failed" && !hasErrored;
      case "passing":
        return status === "succeeded" && !hasErrored && runAssertions.every((a) => deriveAssertionPassed(a));
      case "inFlight":
        return status === "running" || status === "queued";
      default:
        return false;
    }
  }
}
