import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type {
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
  TypeToken,
  WorkflowDefinition,
} from "../../src/index.ts";

import { CredentialResolverFactory } from "../../src/execution/CredentialResolverFactory.ts";
import { AbortControllerFactory } from "../../src/orchestration/AbortControllerFactory.ts";
import {
  TestSuiteOrchestrator,
  type TestSuiteOrchestratorEngine,
} from "../../src/orchestration/TestSuiteOrchestrator.ts";
import { TestSuiteRunIdFactory } from "../../src/orchestration/TestSuiteRunIdFactory.ts";

class StubCredentialSessionService {
  async getSession<TSession>(): Promise<TSession> {
    throw new Error("unused in this test");
  }
}

class CapturingRunEventBus implements RunEventBus {
  readonly events: RunEvent[] = [];
  async publish(event: RunEvent): Promise<void> {
    this.events.push(event);
  }
  async subscribe(): Promise<RunEventSubscription> {
    return { close: async () => {} };
  }
  async subscribeToWorkflow(): Promise<RunEventSubscription> {
    return { close: async () => {} };
  }
}

class StubFakeEngine implements TestSuiteOrchestratorEngine {
  readonly calls: Array<{
    nodeId: NodeId;
    items: Items;
    executionOptions: RunExecutionOptions | undefined;
  }> = [];
  private nextRunId = 0;

  constructor(
    private readonly resultStatusFor: (testCaseIndex: number) => "completed" | "failed" = () => "completed",
  ) {}

  async runWorkflow(
    _wf: WorkflowDefinition,
    startAt: NodeId,
    items: Items,
    _parent: ParentExecutionRef | undefined,
    executionOptions?: RunExecutionOptions,
  ): Promise<RunResult> {
    this.calls.push({ nodeId: startAt, items, executionOptions });
    const runId = `run_${++this.nextRunId}`;
    const idx = executionOptions?.testContext?.testCaseIndex ?? -1;
    const status = this.resultStatusFor(idx);
    if (status === "failed") {
      return {
        runId,
        workflowId: "wf",
        startedAt: new Date(0).toISOString(),
        status: "failed",
        error: { message: "synthetic" },
      };
    }
    return {
      runId,
      workflowId: "wf",
      startedAt: new Date(0).toISOString(),
      status: "completed",
      outputs: items,
    };
  }

  async waitForCompletion(): Promise<Extract<RunResult, { status: "completed" | "failed" }>> {
    throw new Error("not used: stub returns terminal status synchronously from runWorkflow");
  }
}

const TEST_TRIGGER_TYPE: TypeToken<unknown> = Symbol.for("TestSuiteOrchestratorTest.TestTrigger") as TypeToken<unknown>;

function buildWorkflowWithTestTrigger(args: {
  generateItems: TestTriggerNodeConfig<{ idx: number }>["generateItems"];
  triggerNodeId?: NodeId;
}): { workflow: WorkflowDefinition; triggerNodeId: NodeId } {
  const triggerNodeId = args.triggerNodeId ?? "test-trigger";
  const config: TestTriggerNodeConfig<{ idx: number }> = {
    kind: "trigger",
    triggerKind: "test",
    type: TEST_TRIGGER_TYPE,
    name: "fixture trigger",
    generateItems: args.generateItems,
  };
  const workflow: WorkflowDefinition = {
    id: "wf.test.suite",
    name: "Suite WF",
    nodes: [{ id: triggerNodeId, kind: "trigger", type: TEST_TRIGGER_TYPE, name: "fixture trigger", config }],
    edges: [],
  };
  return { workflow, triggerNodeId };
}

function buildOrchestrator(args: { engine: StubFakeEngine; bus?: CapturingRunEventBus }): TestSuiteOrchestrator {
  return new TestSuiteOrchestrator(
    args.engine,
    new TestSuiteRunIdFactory(),
    new CredentialResolverFactory(new StubCredentialSessionService() as never),
    new AbortControllerFactory(),
    args.bus,
    () => new Date("2026-05-02T12:00:00.000Z"),
  );
}

test("TestSuiteOrchestrator dispatches one run per yielded item with testContext set", async () => {
  const engine = new StubFakeEngine();
  const { workflow, triggerNodeId } = buildWorkflowWithTestTrigger({
    async *generateItems(): AsyncIterable<Item<{ idx: number }>> {
      yield { json: { idx: 0 } };
      yield { json: { idx: 1 } };
      yield { json: { idx: 2 } };
    },
  });
  const orchestrator = buildOrchestrator({ engine });

  const result = await orchestrator.runSuite({ workflow, triggerNodeId });

  assert.equal(result.totalCases, 3);
  assert.equal(result.passedCases, 3);
  assert.equal(result.failedCases, 0);
  assert.equal(result.status, "succeeded");

  assert.equal(engine.calls.length, 3);
  for (let i = 0; i < 3; i++) {
    const call = engine.calls[i]!;
    assert.equal(call.nodeId, triggerNodeId);
    assert.equal(call.items.length, 1);
    assert.deepEqual(call.items[0]!.json, { idx: i });
    assert.equal(call.executionOptions?.testContext?.testSuiteRunId, result.testSuiteRunId);
    assert.equal(call.executionOptions?.testContext?.testCaseIndex, i);
  }
});

test("TestSuiteOrchestrator marks suite as 'partial' when some cases fail and others pass", async () => {
  const engine = new StubFakeEngine((idx) => (idx === 1 ? "failed" : "completed"));
  const { workflow, triggerNodeId } = buildWorkflowWithTestTrigger({
    async *generateItems(): AsyncIterable<Item<{ idx: number }>> {
      yield { json: { idx: 0 } };
      yield { json: { idx: 1 } };
      yield { json: { idx: 2 } };
    },
  });
  const orchestrator = buildOrchestrator({ engine });

  const result = await orchestrator.runSuite({ workflow, triggerNodeId });

  assert.equal(result.status, "partial");
  assert.equal(result.passedCases, 2);
  assert.equal(result.failedCases, 1);
  const failed = result.cases.find((c) => c.status === "failed");
  assert.ok(failed);
  assert.equal(failed!.testCaseIndex, 1);
});

test("TestSuiteOrchestrator publishes lifecycle events on the RunEventBus", async () => {
  const engine = new StubFakeEngine();
  const bus = new CapturingRunEventBus();
  const { workflow, triggerNodeId } = buildWorkflowWithTestTrigger({
    async *generateItems(): AsyncIterable<Item<{ idx: number }>> {
      yield { json: { idx: 0 } };
      yield { json: { idx: 1 } };
    },
  });
  const orchestrator = buildOrchestrator({ engine, bus });

  await orchestrator.runSuite({ workflow, triggerNodeId });

  const kinds = bus.events.map((e) => e.kind);
  assert.equal(kinds[0], "testSuiteStarted");
  assert.equal(kinds[kinds.length - 1], "testSuiteFinished");
  assert.equal(kinds.filter((k) => k === "testCaseStarted").length, 2);
  assert.equal(kinds.filter((k) => k === "testCaseCompleted").length, 2);
  const finished = bus.events.find((e) => e.kind === "testSuiteFinished");
  assert.ok(finished);
  if (finished?.kind === "testSuiteFinished") {
    assert.equal(finished.totalCases, 2);
    assert.equal(finished.passedCases, 2);
    assert.equal(finished.status, "succeeded");
  }
});

test("TestSuiteOrchestrator caps concurrency at the configured limit", async () => {
  const observed: number[] = [];
  let inFlight = 0;
  const engine: TestSuiteOrchestratorEngine = {
    async runWorkflow(_wf, _startAt, items, _parent, executionOptions): Promise<RunResult> {
      inFlight += 1;
      observed.push(inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return {
        runId: `run_${executionOptions?.testContext?.testCaseIndex ?? "?"}`,
        workflowId: "wf",
        startedAt: "2026-05-02T12:00:00.000Z",
        status: "completed",
        outputs: items,
      };
    },
    async waitForCompletion() {
      throw new Error("not used");
    },
  };

  const orchestrator = new TestSuiteOrchestrator(
    engine,
    new TestSuiteRunIdFactory(),
    new CredentialResolverFactory(new StubCredentialSessionService() as never),
    new AbortControllerFactory(),
    undefined,
    () => new Date("2026-05-02T12:00:00.000Z"),
  );

  const { workflow, triggerNodeId } = buildWorkflowWithTestTrigger({
    async *generateItems(): AsyncIterable<Item<{ idx: number }>> {
      for (let i = 0; i < 8; i++) yield { json: { idx: i } };
    },
  });

  await orchestrator.runSuite({ workflow, triggerNodeId, concurrency: 2 });

  assert.ok(Math.max(...observed) <= 2, `expected concurrency <=2, observed peaks ${observed.join(",")}`);
});

test("TestSuiteOrchestrator marks suite 'errored' when generateItems throws before any items yielded", async () => {
  const engine = new StubFakeEngine();
  const bus = new CapturingRunEventBus();
  const { workflow, triggerNodeId } = buildWorkflowWithTestTrigger({
    generateItems: (): AsyncIterable<Item<{ idx: number }>> => ({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw new Error("could not load fixtures");
          },
        };
      },
    }),
  });
  const orchestrator = buildOrchestrator({ engine, bus });

  await assert.rejects(orchestrator.runSuite({ workflow, triggerNodeId }), /could not load fixtures/);

  const finished = bus.events.find((e) => e.kind === "testSuiteFinished");
  assert.ok(finished);
  if (finished?.kind === "testSuiteFinished") {
    assert.equal(finished.status, "errored");
    assert.equal(finished.totalCases, 0);
  }
});

test("TestSuiteOrchestrator rejects non-test triggers", async () => {
  const wfMissing: WorkflowDefinition = {
    id: "wf.bad",
    name: "Bad",
    nodes: [
      {
        id: "live-trigger",
        kind: "trigger",
        type: TEST_TRIGGER_TYPE,
        config: { kind: "trigger", triggerKind: "live", type: TEST_TRIGGER_TYPE },
      },
    ],
    edges: [],
  };
  const orchestrator = buildOrchestrator({ engine: new StubFakeEngine() });
  await assert.rejects(
    orchestrator.runSuite({ workflow: wfMissing, triggerNodeId: "live-trigger" }),
    /not a test trigger/,
  );
});
