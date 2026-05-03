import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  AssertionResult,
  Item,
  Items,
  NodeId,
  ParentExecutionRef,
  RunEvent,
  RunEventBus,
  RunEventSubscription,
  RunExecutionOptions,
  RunResult,
  TestTriggerNodeConfig,
  TriggerNodeConfig,
  TypeToken,
  WorkflowDefinition,
} from "@codemation/core";
import {
  AbortControllerFactory,
  TestSuiteOrchestrator,
  TestSuiteRunIdFactory,
  type TestSuiteOrchestratorEngine,
} from "@codemation/core/bootstrap";
import { CredentialResolverFactory } from "@codemation/core/bootstrap";

import { InMemoryTestAssertionRepository } from "../../src/infrastructure/persistence/InMemoryTestAssertionRepository";
import { InMemoryTestSuiteRunRepository } from "../../src/infrastructure/persistence/InMemoryTestSuiteRunRepository";
import { InMemoryWorkflowRunRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowRunRepository";
import { AssertionResultGuard } from "../../src/application/runs/AssertionResultGuard";
import { TestAssertionIdFactory } from "../../src/application/runs/TestAssertionIdFactory";
import { TestRunnerService, type TestRunnerWorkflowLookup } from "../../src/application/runs/TestRunnerService";
import { TestSuiteRunTrackerFactory } from "../../src/application/runs/TestSuiteRunTrackerFactory";

class StubCredentialSessionService {
  async getSession<TSession>(): Promise<TSession> {
    throw new Error("unused in this test");
  }
}

class FanOutBus implements RunEventBus {
  private readonly handlers: Array<(event: RunEvent) => void> = [];
  async publish(event: RunEvent): Promise<void> {
    for (const fn of this.handlers) fn(event);
  }
  async subscribe(onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    this.handlers.push(onEvent);
    return {
      close: async () => {
        const idx = this.handlers.indexOf(onEvent);
        if (idx >= 0) this.handlers.splice(idx, 1);
      },
    };
  }
  async subscribeToWorkflow(_workflowId: string, onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    return await this.subscribe(onEvent);
  }
}

const ASSERTION_NODE_TYPE_TOKEN: TypeToken<unknown> = Symbol.for(
  "TestRunnerService.AssertionNode",
) as TypeToken<unknown>;
const TEST_TRIGGER_TYPE_TOKEN: TypeToken<unknown> = Symbol.for("TestRunnerService.TestTrigger") as TypeToken<unknown>;

class FakeAssertingEngine implements TestSuiteOrchestratorEngine {
  constructor(
    private readonly bus: FanOutBus,
    private readonly assertionsByCase: ReadonlyArray<ReadonlyArray<AssertionResult>>,
    private readonly assertionNodeId: NodeId,
  ) {}

  async runWorkflow(
    wf: WorkflowDefinition,
    _startAt: NodeId,
    items: Items,
    _parent?: ParentExecutionRef,
    executionOptions?: RunExecutionOptions,
  ): Promise<RunResult> {
    const testCaseIndex = executionOptions?.testContext?.testCaseIndex ?? 0;
    const runId = `run_${testCaseIndex}`;
    const assertions = this.assertionsByCase[testCaseIndex] ?? [];

    const assertionItems: Items = assertions.map((a) => ({ json: a as never }));
    await this.bus.publish({
      kind: "nodeCompleted",
      runId,
      workflowId: wf.id,
      at: new Date().toISOString(),
      snapshot: {
        runId,
        workflowId: wf.id,
        nodeId: this.assertionNodeId,
        status: "completed",
        updatedAt: new Date().toISOString(),
        outputs: { main: assertionItems },
      },
    });

    const allPass = assertions.every((a) => !a.errored && a.score >= (a.passThreshold ?? 0.5));
    if (!allPass && assertions.length > 0) {
      return {
        runId,
        workflowId: wf.id,
        startedAt: new Date(0).toISOString(),
        status: "failed",
        error: { message: "assertion failure" },
      };
    }
    return {
      runId,
      workflowId: wf.id,
      startedAt: new Date(0).toISOString(),
      status: "completed",
      outputs: items,
    };
  }

  async waitForCompletion(): Promise<Extract<RunResult, { status: "completed" | "failed" }>> {
    throw new Error("not used: stub returns terminal status synchronously");
  }
}

function buildWorkflow(generateItems: TestTriggerNodeConfig<{ idx: number }>["generateItems"]): {
  workflow: WorkflowDefinition;
  triggerNodeId: NodeId;
  assertionNodeId: NodeId;
} {
  const triggerConfig: TestTriggerNodeConfig<{ idx: number }> = {
    kind: "trigger",
    triggerKind: "test",
    type: TEST_TRIGGER_TYPE_TOKEN,
    name: "fixture trigger",
    generateItems,
  };
  const assertionConfig = {
    kind: "node" as const,
    type: ASSERTION_NODE_TYPE_TOKEN,
    name: "assertions",
    emitsAssertions: true as const,
  };
  const workflow: WorkflowDefinition = {
    id: "wf.test.persistence",
    name: "Persistence WF",
    nodes: [
      { id: "trigger", kind: "trigger", type: TEST_TRIGGER_TYPE_TOKEN, name: "fixture trigger", config: triggerConfig },
      { id: "assert", kind: "node", type: ASSERTION_NODE_TYPE_TOKEN, name: "assertions", config: assertionConfig },
    ],
    edges: [{ from: { nodeId: "trigger", output: "main" }, to: { nodeId: "assert", input: "in" } }],
  };
  return { workflow, triggerNodeId: "trigger", assertionNodeId: "assert" };
}

class StaticWorkflowLookup implements TestRunnerWorkflowLookup {
  constructor(private readonly workflow: WorkflowDefinition) {}
  resolveWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return workflowId === this.workflow.id ? this.workflow : undefined;
  }
}

async function waitForSuiteFinish(repo: InMemoryTestSuiteRunRepository, id: string): Promise<void> {
  // 1000 polls × 5ms = 5s ceiling. Bounded poll instead of `Date.now()` because the
  // host test suite forbids `Date.now()` in tests (no-restricted-properties: nondeterminism).
  const maxAttempts = 1000;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const row = await repo.findById(id);
    if (row && row.status !== "running") return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`TestSuiteRun ${id} did not finalize within 5s`);
}

test("TestRunnerService persists TestSuiteRun, finalizes counters, and records assertion rows per case", async () => {
  const bus = new FanOutBus();
  const suiteRepo = new InMemoryTestSuiteRunRepository();
  const assertionRepo = new InMemoryTestAssertionRepository();

  const { workflow, triggerNodeId, assertionNodeId } = buildWorkflow(async function* (): AsyncIterable<
    Item<{ idx: number }>
  > {
    yield { json: { idx: 0 } };
    yield { json: { idx: 1 } };
  });

  const assertionsByCase: ReadonlyArray<ReadonlyArray<AssertionResult>> = [
    [
      { name: "case0:a", score: 1, expected: 1, actual: 1 },
      { name: "case0:b", score: 1 },
    ],
    [{ name: "case1:a", score: 0, expected: 2, actual: 99, message: "off" }],
  ];
  const fakeEngine = new FakeAssertingEngine(bus, assertionsByCase, assertionNodeId);

  const orchestrator = new TestSuiteOrchestrator(
    fakeEngine,
    new TestSuiteRunIdFactory(),
    new CredentialResolverFactory(new StubCredentialSessionService() as never),
    new AbortControllerFactory(),
    bus,
    () => new Date("2026-05-02T12:00:00.000Z"),
  );

  const runRepo = new InMemoryWorkflowRunRepository();
  const trackerFactory = new TestSuiteRunTrackerFactory(
    suiteRepo,
    assertionRepo,
    runRepo,
    new TestAssertionIdFactory(),
    new AssertionResultGuard(),
  );
  const service = new TestRunnerService(
    orchestrator,
    new StaticWorkflowLookup(workflow),
    bus,
    suiteRepo,
    trackerFactory,
  );

  const result = await service.startTestSuiteRun({
    workflowId: workflow.id,
    triggerNodeId,
  });
  // Fire-and-forget: orchestrator runs in the background. Wait for the suite row to finalize
  // (status leaves "running") before asserting the aggregates.
  await waitForSuiteFinish(suiteRepo, result.testSuiteRunId);

  const persisted = await suiteRepo.findById(result.testSuiteRunId);
  assert.ok(persisted, "TestSuiteRun row should exist after startTestSuiteRun");
  assert.equal(persisted!.totalCases, 2);
  assert.equal(persisted!.passedCases, 1);
  assert.equal(persisted!.failedCases, 1);
  assert.equal(persisted!.status, "partial");
  assert.ok(persisted!.finishedAt, "finishedAt should be set");
  assert.deepEqual([...(persisted!.nodeCoverage ?? [])].sort(), [assertionNodeId].sort());
  assert.equal(persisted!.triggerNodeName, "fixture trigger");

  const allAssertions = await assertionRepo.listByTestSuiteRun(result.testSuiteRunId);
  assert.equal(allAssertions.length, 3, "expected 2 from case 0 + 1 from case 1");
  // Pass/fail is derived: score >= 0.5 (default threshold) and not errored.
  const passing = allAssertions.filter((a) => !a.errored && a.score >= (a.passThreshold ?? 0.5));
  const failing = allAssertions.filter((a) => a.errored || a.score < (a.passThreshold ?? 0.5));
  assert.equal(passing.length, 2);
  assert.equal(failing.length, 1);

  const case0Assertions = await assertionRepo.listByRun("run_0");
  assert.equal(case0Assertions.length, 2);
  assert.deepEqual(
    case0Assertions.map((a) => a.name),
    ["case0:a", "case0:b"],
  );

  const case1Assertions = await assertionRepo.listByRun("run_1");
  assert.equal(case1Assertions.length, 1);
  assert.equal(case1Assertions[0]!.message, "off");
  assert.equal(case1Assertions[0]!.expected, 2);
  assert.equal(case1Assertions[0]!.actual, 99);
});

test("TestRunnerService rejects non-test triggers (defensive guard)", async () => {
  const bus = new FanOutBus();
  const suiteRepo = new InMemoryTestSuiteRunRepository();
  const assertionRepo = new InMemoryTestAssertionRepository();

  const liveTriggerConfig: TriggerNodeConfig = {
    kind: "trigger",
    triggerKind: "live",
    type: TEST_TRIGGER_TYPE_TOKEN,
  };
  const liveTriggerWorkflow: WorkflowDefinition = {
    id: "wf.live.only",
    name: "Live only",
    nodes: [
      {
        id: "live-trigger",
        kind: "trigger",
        type: TEST_TRIGGER_TYPE_TOKEN,
        config: liveTriggerConfig,
      },
    ],
    edges: [],
  };
  const orchestrator = new TestSuiteOrchestrator(
    {} as never,
    new TestSuiteRunIdFactory(),
    new CredentialResolverFactory(new StubCredentialSessionService() as never),
    new AbortControllerFactory(),
    bus,
  );
  const runRepo = new InMemoryWorkflowRunRepository();
  const trackerFactory = new TestSuiteRunTrackerFactory(
    suiteRepo,
    assertionRepo,
    runRepo,
    new TestAssertionIdFactory(),
    new AssertionResultGuard(),
  );
  const service = new TestRunnerService(
    orchestrator,
    new StaticWorkflowLookup(liveTriggerWorkflow),
    bus,
    suiteRepo,
    trackerFactory,
  );

  await assert.rejects(
    service.startTestSuiteRun({ workflowId: "wf.live.only", triggerNodeId: "live-trigger" }),
    /not a test trigger/,
  );

  const list = await suiteRepo.listByWorkflow({ workflowId: "wf.live.only" });
  assert.equal(list.length, 0, "no TestSuiteRun row should be created if trigger validation fails");
});
