/**
 * Behavioral tests for TestRunnerService.
 * Tests the startTestSuiteRun error paths and the read-only methods.
 */
import { describe, expect, it } from "vitest";
import { TestRunnerService } from "../../src/application/runs/TestRunnerService";
import { InMemoryTestSuiteRunRepository } from "../../src/infrastructure/persistence/InMemoryTestSuiteRunRepository";
import { AssertionResultGuard } from "../../src/application/runs/AssertionResultGuard";
import { TestAssertionIdFactory } from "../../src/application/runs/TestAssertionIdFactory";
import { InMemoryTestAssertionRepository } from "../../src/infrastructure/persistence/InMemoryTestAssertionRepository";
import { InMemoryWorkflowRunRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowRunRepository";
import { TestSuiteRunTrackerFactory } from "../../src/application/runs/TestSuiteRunTrackerFactory";

type NodeDef = {
  id: string;
  kind: string;
  name: string;
  config: Record<string, unknown>;
};

function makeWorkflow(nodes: NodeDef[]) {
  return {
    id: "wf-test",
    name: "Test Workflow",
    nodes,
    edges: [],
  };
}

function makeService(
  opts: {
    workflowLookupResult?: ReturnType<typeof makeWorkflow> | null;
    suiteRepo?: InMemoryTestSuiteRunRepository;
  } = {},
) {
  const suiteRepo = opts.suiteRepo ?? new InMemoryTestSuiteRunRepository();
  const assertionRepo = new InMemoryTestAssertionRepository();
  const runRepo = new InMemoryWorkflowRunRepository();
  const idFactory = new TestAssertionIdFactory();
  const guard = new AssertionResultGuard();

  const trackerFactory = new TestSuiteRunTrackerFactory(
    suiteRepo as never,
    assertionRepo,
    runRepo as never,
    idFactory,
    guard,
  );

  const workflowLookup = {
    resolveWorkflow: () => opts.workflowLookupResult ?? null,
  };

  // Minimal eventBus stub
  const eventBus = {
    subscribeToWorkflow: async (_: string, _handler: unknown) => ({
      close: async () => {},
    }),
    emit: async () => {},
  };

  // Minimal orchestrator stub
  const orchestrator = {
    runSuite: async () => ({
      testSuiteRunId: "tsr-stub",
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      status: "succeeded" as const,
      nodeCoverage: [],
    }),
  };

  const service = new TestRunnerService(
    orchestrator as never,
    workflowLookup as never,
    eventBus as never,
    suiteRepo as never,
    trackerFactory as never,
  );

  return { service, suiteRepo };
}

describe("TestRunnerService.startTestSuiteRun — error paths", () => {
  it("throws when workflowId is unknown", async () => {
    const { service } = makeService({ workflowLookupResult: null });
    await expect(
      service.startTestSuiteRun({ workflowId: "wf-missing" as never, triggerNodeId: "trig-1" as never }),
    ).rejects.toThrow(/Unknown workflowId/);
  });

  it("throws when triggerNodeId is not a trigger node", async () => {
    const workflow = makeWorkflow([{ id: "action-1", kind: "action", name: "Action", config: {} }]);
    const { service } = makeService({ workflowLookupResult: workflow as never });
    await expect(
      service.startTestSuiteRun({ workflowId: "wf-test" as never, triggerNodeId: "action-1" as never }),
    ).rejects.toThrow(/not a trigger/);
  });

  it("throws when triggerNodeId is missing from workflow", async () => {
    const workflow = makeWorkflow([
      { id: "trig-1", kind: "trigger", name: "Trigger", config: { triggerKind: "test" } },
    ]);
    const { service } = makeService({ workflowLookupResult: workflow as never });
    await expect(
      service.startTestSuiteRun({ workflowId: "wf-test" as never, triggerNodeId: "nonexistent" as never }),
    ).rejects.toThrow(/not a trigger/);
  });

  it("throws when trigger node has wrong triggerKind", async () => {
    const workflow = makeWorkflow([
      { id: "trig-1", kind: "trigger", name: "Webhook", config: { triggerKind: "webhook" } },
    ]);
    const { service } = makeService({ workflowLookupResult: workflow as never });
    await expect(
      service.startTestSuiteRun({ workflowId: "wf-test" as never, triggerNodeId: "trig-1" as never }),
    ).rejects.toThrow(/not a test trigger/);
  });

  it("returns running status when valid test trigger", async () => {
    const workflow = makeWorkflow([
      { id: "trig-1", kind: "trigger", name: "Test Trigger", config: { triggerKind: "test", name: "Test" } },
    ]);
    const { service } = makeService({ workflowLookupResult: workflow as never });
    const result = await service.startTestSuiteRun({
      workflowId: "wf-test" as never,
      triggerNodeId: "trig-1" as never,
    });
    expect(result.status).toBe("running");
    expect(result.testSuiteRunId).toBeDefined();
  });
});

describe("TestRunnerService.getTestSuiteRun", () => {
  it("returns undefined when not found", async () => {
    const { service } = makeService();
    const result = await service.getTestSuiteRun("nonexistent" as never);
    expect(result).toBeUndefined();
  });

  it("returns suite run when found", async () => {
    const suiteRepo = new InMemoryTestSuiteRunRepository();
    await suiteRepo.create({
      id: "tsr-1",
      workflowId: "wf-1",
      triggerNodeId: "trig-1",
      concurrency: 4,
      startedAt: new Date().toISOString(),
    });
    const { service } = makeService({ suiteRepo });
    const result = await service.getTestSuiteRun("tsr-1" as never);
    expect(result).toBeDefined();
    expect(result?.id).toBe("tsr-1");
  });
});

describe("TestRunnerService.listTestSuiteRuns", () => {
  it("returns empty array when no runs", async () => {
    const { service } = makeService();
    const runs = await service.listTestSuiteRuns("wf-1" as never);
    expect(runs).toHaveLength(0);
  });
});

describe("TestRunnerService.listChildRuns", () => {
  it("returns empty array (in-memory has no child runs)", async () => {
    const { service } = makeService();
    const runs = await service.listChildRuns("tsr-1" as never);
    expect(runs).toHaveLength(0);
  });
});
