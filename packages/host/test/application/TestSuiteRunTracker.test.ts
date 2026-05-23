/**
 * Behavioral tests for TestSuiteRunTracker.
 * Tests the two-stage buffering logic, event ordering guarantees, assertion persistence,
 * node coverage accumulation, finalize rollup, and the deriveSuiteStatusFromCounts branches.
 */
import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@codemation/core";

import { AssertionResultGuard } from "../../src/application/runs/AssertionResultGuard";
import { TestAssertionIdFactory } from "../../src/application/runs/TestAssertionIdFactory";
import { TestSuiteRunTracker } from "../../src/application/runs/TestSuiteRunTracker";
import { InMemoryTestAssertionRepository } from "../../src/infrastructure/persistence/InMemoryTestAssertionRepository";
import { InMemoryTestSuiteRunRepository } from "../../src/infrastructure/persistence/InMemoryTestSuiteRunRepository";
import { InMemoryWorkflowRunRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowRunRepository";

const WORKFLOW: WorkflowDefinition = {
  id: "wf-suite",
  name: "Suite Workflow",
  nodes: [
    {
      id: "trigger-1",
      kind: "trigger",
      name: "Test Trigger",
      config: { triggerKind: "test" },
    } as never,
    {
      id: "assert-node",
      kind: "action",
      name: "Assertions",
      config: { emitsAssertions: true },
    } as never,
    {
      id: "plain-node",
      kind: "action",
      name: "Plain",
      config: {},
    } as never,
  ],
  edges: [],
};

function makeTracker(workflow = WORKFLOW) {
  const suiteRepo = new InMemoryTestSuiteRunRepository();
  const assertionRepo = new InMemoryTestAssertionRepository();
  const runRepo = new InMemoryWorkflowRunRepository();
  const assertionIdFactory = new TestAssertionIdFactory();
  const assertionResultGuard = new AssertionResultGuard();
  const tracker = new TestSuiteRunTracker({
    workflow,
    suiteRepo,
    assertionRepo,
    runRepo,
    assertionIdFactory,
    assertionResultGuard,
  });
  return { tracker, suiteRepo, assertionRepo, runRepo };
}

describe("TestSuiteRunTracker", () => {
  it("finalize returns early when tracker is not adopted", async () => {
    const { tracker, suiteRepo } = makeTracker();
    await suiteRepo.create({
      id: "suite-noadopt",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    // finalize without adopt — should be a no-op (no throw, no update)
    await tracker.finalize({
      testSuiteRunId: "suite-noadopt",
      totalCases: 2,
      passedCases: 2,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });
    // Row should remain at 0 counts (no update happened)
    const record = await suiteRepo.findById("suite-noadopt");
    expect(record?.totalCases).toBe(0);
  });

  it("events before adopt are queued and replayed on adopt", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-1";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });

    // Emit testCaseStarted before adopt — should be queued
    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: suiteId,
      runId: "run-1",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    // Now adopt — queued event should replay
    tracker.adopt(suiteId);

    // Give the queued event time to process
    await new Promise((r) => setTimeout(r, 10));

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 1,
      passedCases: 0,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.totalCases).toBe(1);
  });

  it("testCaseStarted for a different suiteId is ignored", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-mine";
    const otherId = "suite-other";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: otherId, // different suite
      runId: "run-other",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.totalCases).toBe(0);
  });

  it("nodeCompleted before testCaseStarted is buffered and drained on testCaseStarted", async () => {
    const { tracker, suiteRepo, assertionRepo } = makeTracker();
    const suiteId = "suite-drain";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    // nodeCompleted before testCaseStarted — should be buffered
    await tracker.onEvent({
      kind: "nodeCompleted",
      runId: "run-drn",
      workflowId: "wf-suite",
      at: new Date().toISOString(),
      snapshot: {
        nodeId: "assert-node",
        outputs: {
          main: [
            {
              json: { name: "accuracy", score: 0.9 },
            },
          ],
        },
      } as never,
    });

    // Now testCaseStarted arrives — should drain the pending nodeCompleted
    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: suiteId,
      runId: "run-drn",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    await tracker.onEvent({
      kind: "testCaseCompleted",
      testSuiteRunId: suiteId,
      testCaseIndex: 0,
      runId: "run-drn",
      workflowId: "wf-suite",
      status: "succeeded",
      at: new Date().toISOString(),
    });

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const assertions = await assertionRepo.listByTestSuiteRun(suiteId);
    expect(assertions.length).toBe(1);
    expect(assertions[0].name).toBe("accuracy");
  });

  it("assertion failure downgrades testCase status from succeeded to failed", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-fail";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: suiteId,
      runId: "run-fail",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    // Failing assertion (score below default 0.5 threshold)
    await tracker.onEvent({
      kind: "nodeCompleted",
      runId: "run-fail",
      workflowId: "wf-suite",
      at: new Date().toISOString(),
      snapshot: {
        nodeId: "assert-node",
        outputs: {
          main: [
            {
              json: { name: "precision", score: 0.2, passThreshold: 0.8 },
            },
          ],
        },
      } as never,
    });

    await tracker.onEvent({
      kind: "testCaseCompleted",
      testSuiteRunId: suiteId,
      testCaseIndex: 0,
      runId: "run-fail",
      workflowId: "wf-suite",
      status: "succeeded", // orchestrator said succeeded, but tracker should downgrade
      at: new Date().toISOString(),
    });

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    // In-memory repo has no child run rows, so finalize uses assertion fallback:
    // failedFromAssertions=1 > orchestrator failedCases=0 → failedCases=1, passedCases=0
    const record = await suiteRepo.findById(suiteId);
    expect(record?.failedCases).toBe(1);
    expect(record?.passedCases).toBe(0);
  });

  it("errored assertion (errored:true) marks case as failed", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-errored";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: suiteId,
      runId: "run-err",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    await tracker.onEvent({
      kind: "nodeCompleted",
      runId: "run-err",
      workflowId: "wf-suite",
      at: new Date().toISOString(),
      snapshot: {
        nodeId: "assert-node",
        outputs: {
          main: [
            {
              json: { name: "accuracy", score: 0.9, errored: true },
            },
          ],
        },
      } as never,
    });

    await tracker.onEvent({
      kind: "testCaseCompleted",
      testSuiteRunId: suiteId,
      testCaseIndex: 0,
      runId: "run-err",
      workflowId: "wf-suite",
      status: "succeeded",
      at: new Date().toISOString(),
    });

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.failedCases).toBe(1);
  });

  it("nodeCompleted on plain node (no emitsAssertions) does not create assertions", async () => {
    const { tracker, suiteRepo, assertionRepo } = makeTracker();
    const suiteId = "suite-plain";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: suiteId,
      runId: "run-plain",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    await tracker.onEvent({
      kind: "nodeCompleted",
      runId: "run-plain",
      workflowId: "wf-suite",
      at: new Date().toISOString(),
      snapshot: {
        nodeId: "plain-node",
        outputs: { main: [{ json: { name: "test", score: 0.9 } }] },
      } as never,
    });

    await tracker.onEvent({
      kind: "testCaseCompleted",
      testSuiteRunId: suiteId,
      testCaseIndex: 0,
      runId: "run-plain",
      workflowId: "wf-suite",
      status: "succeeded",
      at: new Date().toISOString(),
    });

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const assertions = await assertionRepo.listByTestSuiteRun(suiteId);
    expect(assertions.length).toBe(0);
  });

  it("finalize preserves errored status from orchestrator", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-orce";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 1,
      passedCases: 0,
      failedCases: 1,
      status: "errored",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.status).toBe("errored");
  });

  it("finalize preserves cancelled status from orchestrator", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-cancelled";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 3,
      passedCases: 1,
      failedCases: 1,
      status: "cancelled",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.status).toBe("cancelled");
  });

  it("suite status is partial when some cases pass and some fail", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-partial";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    // Simulate 2 cases: 1 pass, 1 fail via assertions
    for (const [runId, score] of [
      ["run-p1", 0.9],
      ["run-p2", 0.1],
    ] as const) {
      await tracker.onEvent({
        kind: "testCaseStarted",
        testSuiteRunId: suiteId,
        testCaseIndex: 0,
        runId,
        workflowId: "wf-suite",
        at: new Date().toISOString(),
      });

      await tracker.onEvent({
        kind: "nodeCompleted",
        runId,
        workflowId: "wf-suite",
        at: new Date().toISOString(),
        snapshot: {
          nodeId: "assert-node",
          outputs: { main: [{ json: { name: "quality", score, passThreshold: 0.5 } }] },
        } as never,
      });

      await tracker.onEvent({
        kind: "testCaseCompleted",
        testSuiteRunId: suiteId,
        testCaseIndex: 0,
        runId,
        workflowId: "wf-suite",
        status: "succeeded",
        at: new Date().toISOString(),
      });
    }

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 2,
      passedCases: 2,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.status).toBe("partial");
  });

  it("node coverage is accumulated across runs", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-cov";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    for (const [runId, nodeId] of [
      ["run-c1", "plain-node"],
      ["run-c2", "assert-node"],
    ] as const) {
      await tracker.onEvent({
        kind: "testCaseStarted",
        testSuiteRunId: suiteId,
        testCaseIndex: 0,
        runId,
        workflowId: "wf-suite",
        at: new Date().toISOString(),
      });

      await tracker.onEvent({
        kind: "nodeCompleted",
        runId,
        workflowId: "wf-suite",
        at: new Date().toISOString(),
        snapshot: {
          nodeId,
          outputs: {},
        } as never,
      });

      await tracker.onEvent({
        kind: "testCaseCompleted",
        testSuiteRunId: suiteId,
        testCaseIndex: 0,
        runId,
        workflowId: "wf-suite",
        status: "succeeded",
        at: new Date().toISOString(),
      });
    }

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 2,
      passedCases: 2,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.nodeCoverage).toContain("plain-node");
    expect(record?.nodeCoverage).toContain("assert-node");
  });

  it("nodeCompleted with unknown nodeId does not crash", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-unknown";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: suiteId,
      runId: "run-unk",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    // nodeCompleted with unknown nodeId — no assertion config found, should be a no-op
    await tracker.onEvent({
      kind: "nodeCompleted",
      runId: "run-unk",
      workflowId: "wf-suite",
      at: new Date().toISOString(),
      snapshot: {
        nodeId: "nonexistent-node",
        outputs: { main: [{ json: { name: "test", score: 0.9 } }] },
      } as never,
    });

    await tracker.onEvent({
      kind: "testCaseCompleted",
      testSuiteRunId: suiteId,
      testCaseIndex: 0,
      runId: "run-unk",
      workflowId: "wf-suite",
      status: "succeeded",
      at: new Date().toISOString(),
    });

    await expect(
      tracker.finalize({
        testSuiteRunId: suiteId,
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        status: "succeeded",
        workflowId: "wf-suite",
        triggerNodeId: "trigger-1",
        cases: [],
      }),
    ).resolves.not.toThrow();
  });

  it("testCaseCompleted with status errored or cancelled is preserved", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-case-err";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: suiteId,
      runId: "run-case-err",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    // Orchestrator says errored
    await tracker.onEvent({
      kind: "testCaseCompleted",
      testSuiteRunId: suiteId,
      testCaseIndex: 0,
      runId: "run-case-err",
      workflowId: "wf-suite",
      status: "errored",
      at: new Date().toISOString(),
    });

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 1,
      passedCases: 0,
      failedCases: 1,
      status: "errored",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.status).toBe("errored");
  });

  it("suite with zero cases gets succeeded status", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-zero";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.status).toBe("succeeded");
    expect(record?.totalCases).toBe(0);
  });

  it("suite with all failed cases gets failed status", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-allfail";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    // 2 runs, both with failing assertions
    for (const runId of ["run-af1", "run-af2"]) {
      await tracker.onEvent({
        kind: "testCaseStarted",
        testSuiteRunId: suiteId,
        testCaseIndex: 0,
        runId,
        workflowId: "wf-suite",
        at: new Date().toISOString(),
      });

      await tracker.onEvent({
        kind: "nodeCompleted",
        runId,
        workflowId: "wf-suite",
        at: new Date().toISOString(),
        snapshot: {
          nodeId: "assert-node",
          outputs: { main: [{ json: { name: "score", score: 0.1, passThreshold: 0.8 } }] },
        } as never,
      });

      await tracker.onEvent({
        kind: "testCaseCompleted",
        testSuiteRunId: suiteId,
        testCaseIndex: 0,
        runId,
        workflowId: "wf-suite",
        status: "succeeded",
        at: new Date().toISOString(),
      });
    }

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 2,
      passedCases: 2,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const record = await suiteRepo.findById(suiteId);
    expect(record?.status).toBe("failed");
  });

  it("default event kind is a no-op (does not throw)", async () => {
    const { tracker, suiteRepo } = makeTracker();
    const suiteId = "suite-default";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await expect(
      tracker.onEvent({
        kind: "runCompleted",
        runId: "run-rc",
        workflowId: "wf-suite",
        at: new Date().toISOString(),
      } as never),
    ).resolves.not.toThrow();
  });

  it("assertion with empty items on main does not create assertion rows", async () => {
    const { tracker, suiteRepo, assertionRepo } = makeTracker();
    const suiteId = "suite-empty-items";
    await suiteRepo.create({
      id: suiteId,
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    tracker.adopt(suiteId);

    await tracker.onEvent({
      kind: "testCaseStarted",
      testSuiteRunId: suiteId,
      runId: "run-ei",
      testCaseIndex: 0,
      workflowId: "wf-suite",
      at: new Date().toISOString(),
    });

    await tracker.onEvent({
      kind: "nodeCompleted",
      runId: "run-ei",
      workflowId: "wf-suite",
      at: new Date().toISOString(),
      snapshot: {
        nodeId: "assert-node",
        outputs: { main: [] }, // empty items
      } as never,
    });

    await tracker.onEvent({
      kind: "testCaseCompleted",
      testSuiteRunId: suiteId,
      testCaseIndex: 0,
      runId: "run-ei",
      workflowId: "wf-suite",
      status: "succeeded",
      at: new Date().toISOString(),
    });

    await tracker.finalize({
      testSuiteRunId: suiteId,
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
      status: "succeeded",
      workflowId: "wf-suite",
      triggerNodeId: "trigger-1",
      cases: [],
    });

    const assertions = await assertionRepo.listByTestSuiteRun(suiteId);
    expect(assertions.length).toBe(0);
  });
});
