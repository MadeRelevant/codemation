import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type { WorkflowId } from "@codemation/core";

import { TestAssertionAggregator } from "../../src/application/runs/TestAssertionAggregator";
import { InMemoryTestAssertionRepository } from "../../src/infrastructure/persistence/InMemoryTestAssertionRepository";
import { InMemoryTestSuiteRunRepository } from "../../src/infrastructure/persistence/InMemoryTestSuiteRunRepository";

const WORKFLOW_ID = "wf.aggregator" as WorkflowId;

async function seedSuiteRuns(
  suiteRepo: InMemoryTestSuiteRunRepository,
  rows: ReadonlyArray<{ readonly id: string; readonly startedAt: string; readonly workflowId?: string }>,
): Promise<void> {
  for (const row of rows) {
    await suiteRepo.create({
      id: row.id,
      workflowId: row.workflowId ?? WORKFLOW_ID,
      triggerNodeId: "trigger",
      concurrency: 1,
      startedAt: row.startedAt,
    });
  }
}

async function seedAssertions(
  assertionRepo: InMemoryTestAssertionRepository,
  rows: ReadonlyArray<{
    readonly id: string;
    readonly testSuiteRunId: string;
    readonly name: string;
    readonly score: number;
    readonly workflowId?: string;
  }>,
): Promise<void> {
  for (const row of rows) {
    await assertionRepo.record({
      id: row.id,
      runId: `${row.testSuiteRunId}-run-${row.id}`,
      testSuiteRunId: row.testSuiteRunId,
      workflowId: row.workflowId ?? WORKFLOW_ID,
      nodeId: "assert-node",
      name: row.name,
      score: row.score,
      createdAt: new Date().toISOString(),
    });
  }
}

test("getAssertionMetricTrends returns one entry per distinct name when names is omitted", async () => {
  const suiteRepo = new InMemoryTestSuiteRunRepository();
  const assertionRepo = new InMemoryTestAssertionRepository();
  await seedSuiteRuns(suiteRepo, [
    { id: "tsr-A", startedAt: "2026-04-01T00:00:00.000Z" },
    { id: "tsr-B", startedAt: "2026-04-02T00:00:00.000Z" },
  ]);
  await seedAssertions(assertionRepo, [
    { id: "1", testSuiteRunId: "tsr-A", name: "accuracy", score: 1.0 },
    { id: "2", testSuiteRunId: "tsr-A", name: "accuracy", score: 0.5 },
    { id: "3", testSuiteRunId: "tsr-A", name: "latency", score: 0.8 },
    { id: "4", testSuiteRunId: "tsr-B", name: "accuracy", score: 0.9 },
    // A different workflow - must be ignored.
    { id: "5", testSuiteRunId: "other", name: "ignored", score: 0.1, workflowId: "wf.other" },
  ]);

  const aggregator = new TestAssertionAggregator(assertionRepo, suiteRepo);
  const trends = await aggregator.getAssertionMetricTrends({ workflowId: WORKFLOW_ID });

  // Distinct names alphabetical, the cross-workflow row is excluded.
  assert.deepEqual(
    trends.map((t) => t.name),
    ["accuracy", "latency"],
  );

  const accuracy = trends.find((t) => t.name === "accuracy");
  assert.ok(accuracy);
  assert.equal(accuracy!.perSuiteRun.length, 2);
  // Sorted oldest -> newest by startedAt.
  assert.deepEqual(
    accuracy!.perSuiteRun.map((p) => p.testSuiteRunId),
    ["tsr-A", "tsr-B"],
  );
  // Mean of [1.0, 0.5] = 0.75 for tsr-A; sample count = 2.
  assert.equal(accuracy!.perSuiteRun[0]!.meanScore, 0.75);
  assert.equal(accuracy!.perSuiteRun[0]!.sampleCount, 2);
  assert.equal(accuracy!.perSuiteRun[0]!.startedAt, "2026-04-01T00:00:00.000Z");
  // tsr-B has one row at 0.9.
  assert.equal(accuracy!.perSuiteRun[1]!.meanScore, 0.9);
  assert.equal(accuracy!.perSuiteRun[1]!.sampleCount, 1);

  const latency = trends.find((t) => t.name === "latency");
  assert.ok(latency);
  assert.equal(latency!.perSuiteRun.length, 1);
  assert.equal(latency!.perSuiteRun[0]!.meanScore, 0.8);
});

test("getAssertionMetricTrends respects names filter and preserves caller order", async () => {
  const suiteRepo = new InMemoryTestSuiteRunRepository();
  const assertionRepo = new InMemoryTestAssertionRepository();
  await seedSuiteRuns(suiteRepo, [{ id: "tsr-A", startedAt: "2026-04-01T00:00:00.000Z" }]);
  await seedAssertions(assertionRepo, [
    { id: "1", testSuiteRunId: "tsr-A", name: "accuracy", score: 0.9 },
    { id: "2", testSuiteRunId: "tsr-A", name: "latency", score: 0.7 },
    { id: "3", testSuiteRunId: "tsr-A", name: "cost", score: 0.5 },
  ]);

  const aggregator = new TestAssertionAggregator(assertionRepo, suiteRepo);
  const trends = await aggregator.getAssertionMetricTrends({
    workflowId: WORKFLOW_ID,
    names: ["latency", "accuracy"],
  });

  // Order preserved (latency, then accuracy), and "cost" excluded.
  assert.deepEqual(
    trends.map((t) => t.name),
    ["latency", "accuracy"],
  );
});

test("getAssertionMetricTrends returns requested names with empty perSuiteRun when no data yet", async () => {
  const suiteRepo = new InMemoryTestSuiteRunRepository();
  const assertionRepo = new InMemoryTestAssertionRepository();

  const aggregator = new TestAssertionAggregator(assertionRepo, suiteRepo);
  const trends = await aggregator.getAssertionMetricTrends({
    workflowId: WORKFLOW_ID,
    names: ["future-metric"],
  });

  assert.deepEqual(trends, [{ name: "future-metric", perSuiteRun: [] }]);
});

test("getAssertionMetricTrends ignores aggregations whose suite-run row has been deleted", async () => {
  const suiteRepo = new InMemoryTestSuiteRunRepository();
  const assertionRepo = new InMemoryTestAssertionRepository();
  await seedSuiteRuns(suiteRepo, [
    { id: "tsr-A", startedAt: "2026-04-01T00:00:00.000Z" },
    { id: "tsr-B", startedAt: "2026-04-02T00:00:00.000Z" },
  ]);
  await seedAssertions(assertionRepo, [
    { id: "1", testSuiteRunId: "tsr-A", name: "accuracy", score: 1.0 },
    { id: "2", testSuiteRunId: "tsr-B", name: "accuracy", score: 0.5 },
  ]);
  // Delete tsr-B's suite-run row but leave its assertion rows behind.
  await suiteRepo.deleteById("tsr-B");

  const aggregator = new TestAssertionAggregator(assertionRepo, suiteRepo);
  const trends = await aggregator.getAssertionMetricTrends({ workflowId: WORKFLOW_ID });
  const accuracy = trends.find((t) => t.name === "accuracy");
  assert.ok(accuracy);
  assert.equal(accuracy!.perSuiteRun.length, 1);
  assert.equal(accuracy!.perSuiteRun[0]!.testSuiteRunId, "tsr-A");
});
