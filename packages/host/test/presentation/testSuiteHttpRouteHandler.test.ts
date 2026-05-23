// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { TestSuiteRunRecord } from "../../src/domain/runs/TestSuiteRunRepository";
import type { TestAssertionRecord } from "../../src/domain/runs/TestAssertionRepository";
import { TestAssertionAggregator } from "../../src/application/runs/TestAssertionAggregator";
import { TestAssertionMapper } from "../../src/application/runs/TestAssertionMapper";
import { TestSuiteChildRunMapper } from "../../src/application/runs/TestSuiteChildRunMapper";
import { TestSuiteRunSummaryMapper } from "../../src/application/runs/TestSuiteRunSummaryMapper";
import { TestSuiteHttpRouteHandler } from "../../src/presentation/http/routeHandlers/TestSuiteHttpRouteHandler";
import { TestRunnerService } from "../../src/application/runs/TestRunnerService";

function makeSuiteRecord(overrides: Partial<TestSuiteRunRecord> = {}): TestSuiteRunRecord {
  return {
    id: "suite_1",
    workflowId: "wf_1",
    triggerNodeId: "trigger_node",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    totalCases: 3,
    passedCases: 2,
    failedCases: 1,
    updatedAt: "2026-01-01T00:01:00.000Z",
    concurrency: 2,
    ...overrides,
  } as unknown as TestSuiteRunRecord;
}

function makeAssertionRecord(overrides: Partial<TestAssertionRecord> = {}): TestAssertionRecord {
  return {
    id: "assert_1",
    runId: "run_1",
    testSuiteRunId: "suite_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    name: "response.quality",
    score: 1,
    ...overrides,
  } as unknown as TestAssertionRecord;
}

class TestSuiteRunRepositoryStub {
  constructor(
    private readonly suites: ReadonlyArray<TestSuiteRunRecord>,
    private readonly suiteById: Map<string, TestSuiteRunRecord> = new Map(),
  ) {}

  async listByWorkflow(_args: { workflowId: string }): Promise<ReadonlyArray<TestSuiteRunRecord>> {
    return this.suites;
  }

  async findById(id: string): Promise<TestSuiteRunRecord | null> {
    return this.suiteById.get(id) ?? null;
  }
}

class TestAssertionRepositoryStub {
  constructor(private readonly assertions: ReadonlyArray<TestAssertionRecord>) {}

  async listByTestSuiteRun(_id: string): Promise<ReadonlyArray<TestAssertionRecord>> {
    return this.assertions;
  }

  async listByRun(_runId: string): Promise<ReadonlyArray<TestAssertionRecord>> {
    return this.assertions;
  }

  async listAggregatedByWorkflow(
    _args: unknown,
  ): Promise<ReadonlyArray<{ name: string; meanScore: number; testSuiteRunId: string }>> {
    return [];
  }
}

class TestRunnerServiceStub {
  constructor(
    private readonly result: { testSuiteRunId: string; status: "running" },
    private readonly childRuns: ReadonlyArray<unknown> = [],
  ) {}

  async startTestSuiteRun(_args: unknown): Promise<{ testSuiteRunId: string; status: "running" }> {
    return this.result;
  }

  async listChildRuns(_testSuiteRunId: string): Promise<ReadonlyArray<unknown>> {
    return this.childRuns;
  }
}

class TestAssertionAggregatorStub {
  async getAssertionMetricTrends(
    _args: unknown,
  ): Promise<ReadonlyArray<{ name: string; perSuiteRun: ReadonlyArray<unknown> }>> {
    return [{ name: "quality", perSuiteRun: [] }];
  }
}

function makeHandler(
  args: {
    suites?: ReadonlyArray<TestSuiteRunRecord>;
    suiteById?: Map<string, TestSuiteRunRecord>;
    assertions?: ReadonlyArray<TestAssertionRecord>;
    runnerResult?: { testSuiteRunId: string; status: "running" };
    childRuns?: ReadonlyArray<unknown>;
  } = {},
): TestSuiteHttpRouteHandler {
  const suiteRepo = new TestSuiteRunRepositoryStub(args.suites ?? [], args.suiteById ?? new Map());
  const assertionRepo = new TestAssertionRepositoryStub(args.assertions ?? []);
  const runner = new TestRunnerServiceStub(
    args.runnerResult ?? { testSuiteRunId: "suite_new", status: "running" },
    args.childRuns ?? [],
  );
  const aggregator = new TestAssertionAggregatorStub();

  return new TestSuiteHttpRouteHandler(
    runner as unknown as TestRunnerService,
    suiteRepo as never,
    assertionRepo as never,
    aggregator as unknown as TestAssertionAggregator,
    new TestSuiteRunSummaryMapper(),
    new TestAssertionMapper(),
    new TestSuiteChildRunMapper(),
  );
}

describe("TestSuiteHttpRouteHandler.postStartTestSuiteRun", () => {
  it("returns 400 when triggerNodeId is missing from body", async () => {
    const handler = makeHandler();
    const request = new Request("http://localhost/api/workflows/wf_1/test-suites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await handler.postStartTestSuiteRun(request, { workflowId: "wf_1" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Request body must include string triggerNodeId" });
  });

  it("returns 400 when triggerNodeId is an empty string", async () => {
    const handler = makeHandler();
    const request = new Request("http://localhost/api/workflows/wf_1/test-suites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ triggerNodeId: "  " }),
    });
    const response = await handler.postStartTestSuiteRun(request, { workflowId: "wf_1" });
    expect(response.status).toBe(400);
  });

  it("returns 201 with testSuiteRunId when triggered successfully", async () => {
    const handler = makeHandler({ runnerResult: { testSuiteRunId: "suite_abc", status: "running" } });
    const request = new Request("http://localhost/api/workflows/wf_1/test-suites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ triggerNodeId: "trigger_1" }),
    });
    const response = await handler.postStartTestSuiteRun(request, { workflowId: "wf_1" });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ testSuiteRunId: "suite_abc", status: "running" });
  });

  it("passes concurrency from body to testRunner", async () => {
    const handler = makeHandler({ runnerResult: { testSuiteRunId: "suite_abc", status: "running" } });
    const request = new Request("http://localhost/api/workflows/wf_1/test-suites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ triggerNodeId: "trigger_1", concurrency: 4 }),
    });
    const response = await handler.postStartTestSuiteRun(request, { workflowId: "wf_1" });
    expect(response.status).toBe(201);
  });

  it("returns 500 on unexpected error from testRunner", async () => {
    class ErrorRunner {
      async startTestSuiteRun(): Promise<never> {
        throw new Error("runner-error");
      }
    }
    const handler = new TestSuiteHttpRouteHandler(
      new ErrorRunner() as unknown as TestRunnerService,
      new TestSuiteRunRepositoryStub([]) as never,
      new TestAssertionRepositoryStub([]) as never,
      new TestAssertionAggregatorStub() as unknown as TestAssertionAggregator,
      new TestSuiteRunSummaryMapper(),
      new TestAssertionMapper(),
      new TestSuiteChildRunMapper(),
    );
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ triggerNodeId: "t" }),
    });
    const response = await handler.postStartTestSuiteRun(request, { workflowId: "wf_1" });
    expect(response.status).toBe(500);
  });
});

describe("TestSuiteHttpRouteHandler.getTestSuiteRuns", () => {
  it("returns list of test suite run summaries", async () => {
    const suite = makeSuiteRecord();
    const handler = makeHandler({ suites: [suite] });
    const response = await handler.getTestSuiteRuns(new Request("http://localhost"), { workflowId: "wf_1" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "suite_1", workflowId: "wf_1" });
  });
});

describe("TestSuiteHttpRouteHandler.getTestSuiteRun", () => {
  it("returns 404 when testSuiteRunId not found", async () => {
    const handler = makeHandler({ suiteById: new Map() });
    const response = await handler.getTestSuiteRun(new Request("http://localhost"), { testSuiteRunId: "missing" });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "Unknown testSuiteRunId" });
  });

  it("returns suite detail when found", async () => {
    const suite = makeSuiteRecord();
    const handler = makeHandler({ suiteById: new Map([["suite_1", suite]]) });
    const response = await handler.getTestSuiteRun(new Request("http://localhost"), { testSuiteRunId: "suite_1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "suite_1" });
  });
});

describe("TestSuiteHttpRouteHandler.getTestSuiteRunAssertions", () => {
  it("returns 404 when testSuiteRun not found", async () => {
    const handler = makeHandler({ suiteById: new Map(), assertions: [] });
    const response = await handler.getTestSuiteRunAssertions(new Request("http://localhost"), { testSuiteRunId: "x" });
    expect(response.status).toBe(404);
  });

  it("returns assertions mapped to DTOs", async () => {
    const suite = makeSuiteRecord();
    const assertion = makeAssertionRecord();
    const handler = makeHandler({
      suiteById: new Map([["suite_1", suite]]),
      assertions: [assertion],
    });
    const response = await handler.getTestSuiteRunAssertions(new Request("http://localhost"), {
      testSuiteRunId: "suite_1",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "assert_1", name: "response.quality" });
  });
});

describe("TestSuiteHttpRouteHandler.getRunAssertions", () => {
  it("returns assertions for a run", async () => {
    const assertion = makeAssertionRecord();
    const handler = makeHandler({ assertions: [assertion] });
    const response = await handler.getRunAssertions(new Request("http://localhost"), { runId: "run_1" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
  });
});

describe("TestSuiteHttpRouteHandler.getTestSuiteRunChildRuns", () => {
  it("returns child runs", async () => {
    const handler = makeHandler({ childRuns: [{ runId: "child_1", status: "completed" }] });
    const response = await handler.getTestSuiteRunChildRuns(new Request("http://localhost"), {
      testSuiteRunId: "suite_1",
    });
    expect(response.status).toBe(200);
  });
});

describe("TestSuiteHttpRouteHandler.getAssertionMetricTrends", () => {
  it("returns trends without names filter", async () => {
    const handler = makeHandler();
    const response = await handler.getAssertionMetricTrends(
      new Request("http://localhost/api/workflows/wf_1/test-suites/trends"),
      { workflowId: "wf_1" },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ name: "quality" });
  });

  it("passes names filter when ?names= provided", async () => {
    const handler = makeHandler();
    const response = await handler.getAssertionMetricTrends(
      new Request("http://localhost/api/workflows/wf_1/test-suites/trends?names=quality,accuracy"),
      { workflowId: "wf_1" },
    );
    expect(response.status).toBe(200);
  });
});
