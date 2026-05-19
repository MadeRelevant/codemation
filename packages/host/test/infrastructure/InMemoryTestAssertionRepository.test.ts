/**
 * Behavioral tests for InMemoryTestAssertionRepository.
 * Covers uncovered branches: listByTestSuiteRun, deleteByTestSuiteRun,
 * listDistinctNamesByWorkflow, aggregateMeanScoreByNameAndSuiteRun.
 */
import { describe, expect, it } from "vitest";
import { InMemoryTestAssertionRepository } from "../../src/infrastructure/persistence/InMemoryTestAssertionRepository";

function makeRepo() {
  return new InMemoryTestAssertionRepository();
}

const BASE_ARGS = {
  id: "a-1",
  runId: "run-1",
  testSuiteRunId: "suite-1",
  workflowId: "wf-1",
  nodeId: "node-1",
  name: "accuracy",
  score: 0.9,
  createdAt: "2024-01-01T00:00:00Z",
};

describe("InMemoryTestAssertionRepository", () => {
  it("record and listByRun return sorted assertions", async () => {
    const repo = makeRepo();
    await repo.record({ ...BASE_ARGS, id: "a-1", createdAt: "2024-01-02T00:00:00Z" });
    await repo.record({ ...BASE_ARGS, id: "a-2", createdAt: "2024-01-01T00:00:00Z" });
    const results = await repo.listByRun("run-1");
    expect(results[0].id).toBe("a-2"); // Earlier first
    expect(results[1].id).toBe("a-1");
  });

  it("listByTestSuiteRun filters by testSuiteRunId", async () => {
    const repo = makeRepo();
    await repo.record({ ...BASE_ARGS, id: "a-1", testSuiteRunId: "suite-1" });
    await repo.record({ ...BASE_ARGS, id: "a-2", testSuiteRunId: "suite-2" });
    const results = await repo.listByTestSuiteRun("suite-1");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a-1");
  });

  it("deleteByTestSuiteRun removes matching records", async () => {
    const repo = makeRepo();
    await repo.record({ ...BASE_ARGS, id: "a-1", testSuiteRunId: "suite-1" });
    await repo.record({ ...BASE_ARGS, id: "a-2", testSuiteRunId: "suite-2" });
    await repo.deleteByTestSuiteRun("suite-1");
    const remaining = await repo.listByRun("run-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("a-2");
  });

  it("listDistinctNamesByWorkflow returns sorted unique names", async () => {
    const repo = makeRepo();
    await repo.record({ ...BASE_ARGS, id: "a-1", name: "coherence", workflowId: "wf-1" });
    await repo.record({ ...BASE_ARGS, id: "a-2", name: "accuracy", workflowId: "wf-1" });
    await repo.record({ ...BASE_ARGS, id: "a-3", name: "coherence", workflowId: "wf-1" }); // duplicate
    await repo.record({ ...BASE_ARGS, id: "a-4", name: "relevance", workflowId: "wf-2" }); // different workflow
    const names = await repo.listDistinctNamesByWorkflow("wf-1");
    expect(names).toEqual(["accuracy", "coherence"]); // sorted, deduplicated
  });

  it("aggregateMeanScoreByNameAndSuiteRun computes mean scores", async () => {
    const repo = makeRepo();
    await repo.record({ ...BASE_ARGS, id: "a-1", name: "accuracy", score: 0.8, testSuiteRunId: "suite-1" });
    await repo.record({ ...BASE_ARGS, id: "a-2", name: "accuracy", score: 0.6, testSuiteRunId: "suite-1" });
    const results = await repo.aggregateMeanScoreByNameAndSuiteRun({ workflowId: "wf-1" });
    expect(results).toHaveLength(1);
    expect(results[0].meanScore).toBeCloseTo(0.7);
    expect(results[0].sampleCount).toBe(2);
  });

  it("aggregateMeanScoreByNameAndSuiteRun filters by name when names provided", async () => {
    const repo = makeRepo();
    await repo.record({ ...BASE_ARGS, id: "a-1", name: "accuracy", score: 0.9, testSuiteRunId: "suite-1" });
    await repo.record({ ...BASE_ARGS, id: "a-2", name: "coherence", score: 0.5, testSuiteRunId: "suite-1" });
    const results = await repo.aggregateMeanScoreByNameAndSuiteRun({
      workflowId: "wf-1",
      names: ["accuracy"],
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("accuracy");
  });

  it("record stores optional fields correctly", async () => {
    const repo = makeRepo();
    await repo.record({
      ...BASE_ARGS,
      errored: true,
      expected: "yes",
      actual: "no",
      message: "mismatch",
      details: { key: "value" },
      passThreshold: 0.8,
      iterationId: "iter-1",
      itemIndex: 2,
    });
    const results = await repo.listByRun("run-1");
    expect(results[0].errored).toBe(true);
    expect(results[0].expected).toBe("yes");
    expect(results[0].actual).toBe("no");
    expect(results[0].itemIndex).toBe(2);
  });
});
