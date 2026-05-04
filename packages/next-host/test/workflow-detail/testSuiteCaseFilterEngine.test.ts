import type { TestAssertionDto, TestSuiteChildRunDto } from "@codemation/host/dto";
import { describe, expect, it } from "vitest";

import {
  type TestSuiteCaseFilter,
  TestSuiteCaseFilterEngine,
} from "../../src/features/workflows/components/workflowDetail/tests/TestSuiteCaseFilter";

function makeRun(partial: Partial<TestSuiteChildRunDto> & Pick<TestSuiteChildRunDto, "runId">): TestSuiteChildRunDto {
  return {
    runId: partial.runId,
    testSuiteRunId: partial.testSuiteRunId ?? "tsr_test",
    testCaseIndex: partial.testCaseIndex ?? 0,
    status: partial.status ?? "completed",
    startedAt: partial.startedAt ?? "2026-05-04T10:00:00Z",
    ...(partial.testCaseStatus !== undefined ? { testCaseStatus: partial.testCaseStatus } : {}),
    ...(partial.testCaseLabel !== undefined ? { testCaseLabel: partial.testCaseLabel } : {}),
    ...(partial.finishedAt !== undefined ? { finishedAt: partial.finishedAt } : {}),
  };
}

let nextAssertionIdSeq = 0;
function makeAssertion(
  partial: Partial<TestAssertionDto> & Pick<TestAssertionDto, "runId" | "score">,
): TestAssertionDto {
  // Deterministic id factory; Math.random is forbidden by lint to keep tests reproducible.
  return {
    id: partial.id ?? `tas_${(nextAssertionIdSeq++).toString(36).padStart(6, "0")}`,
    runId: partial.runId,
    testSuiteRunId: partial.testSuiteRunId ?? "tsr_test",
    workflowId: partial.workflowId ?? "wf_test",
    nodeId: partial.nodeId ?? "assert_node",
    name: partial.name ?? "test assertion",
    score: partial.score,
    createdAt: partial.createdAt ?? "2026-05-04T10:00:01Z",
    ...(partial.passThreshold !== undefined ? { passThreshold: partial.passThreshold } : {}),
    ...(partial.errored === true ? { errored: true } : {}),
  };
}

describe("TestSuiteCaseFilterEngine", () => {
  // Five-case fixture covering every bucket the chip strip needs to address.
  const PASSING = makeRun({ runId: "r_passing", testCaseStatus: "succeeded" });
  const FAILING = makeRun({ runId: "r_failing", testCaseStatus: "failed" });
  const ERRORED_BY_CASE = makeRun({ runId: "r_errored_case", testCaseStatus: "errored" });
  const ERRORED_BY_ASSERTION = makeRun({ runId: "r_errored_assertion", testCaseStatus: "failed" });
  const RUNNING = makeRun({ runId: "r_running", status: "running", testCaseStatus: "running" });
  const RUNS = [PASSING, FAILING, ERRORED_BY_CASE, ERRORED_BY_ASSERTION, RUNNING];

  const ASSERTIONS: ReadonlyArray<TestAssertionDto> = [
    makeAssertion({ runId: PASSING.runId, score: 1 }),
    makeAssertion({ runId: PASSING.runId, score: 0.9, passThreshold: 0.7 }),
    makeAssertion({ runId: FAILING.runId, score: 0 }),
    makeAssertion({ runId: ERRORED_BY_ASSERTION.runId, score: 0, errored: true }),
  ];

  it("counts each case in exactly one bucket", () => {
    const counts = TestSuiteCaseFilterEngine.counts(RUNS, ASSERTIONS);
    expect(counts).toEqual({ all: 5, passing: 1, failing: 1, errored: 2, inFlight: 1 });
    // Buckets must partition: each case counted exactly once across passing/failing/errored/inFlight.
    expect(counts.passing + counts.failing + counts.errored + counts.inFlight).toBe(counts.all);
  });

  it.each<[TestSuiteCaseFilter, ReadonlyArray<string>]>([
    ["all", [PASSING.runId, FAILING.runId, ERRORED_BY_CASE.runId, ERRORED_BY_ASSERTION.runId, RUNNING.runId]],
    ["passing", [PASSING.runId]],
    ["failing", [FAILING.runId]],
    ["errored", [ERRORED_BY_CASE.runId, ERRORED_BY_ASSERTION.runId]],
    ["inFlight", [RUNNING.runId]],
  ])("filter %s returns the expected runs", (filter, expectedIds) => {
    const filtered = TestSuiteCaseFilterEngine.apply(RUNS, ASSERTIONS, filter);
    expect(filtered.map((r) => r.runId)).toEqual(expectedIds);
  });

  it("does not classify a `succeeded` case as passing when one of its assertions errored", () => {
    const partiallyErrored = makeRun({ runId: "r_partial", testCaseStatus: "succeeded" });
    const erroredAssertion = makeAssertion({ runId: partiallyErrored.runId, score: 1, errored: true });
    const counts = TestSuiteCaseFilterEngine.counts([partiallyErrored], [erroredAssertion]);
    // Erroring evaluator beats a high score — surface it under errored so it's not hidden in passing.
    expect(counts).toEqual({ all: 1, passing: 0, failing: 0, errored: 1, inFlight: 0 });
  });
});
