import type {
  AssertionResult,
  JsonValue,
  NodeConfigBase,
  NodeId,
  RunEvent,
  RunId,
  WorkflowDefinition,
} from "@codemation/core";

import type { TestSuiteRunResult } from "@codemation/core/bootstrap";

import type { TestAssertionRepository } from "../../domain/runs/TestAssertionRepository";
import type { TestSuiteRunRepository } from "../../domain/runs/TestSuiteRunRepository";
import type { AssertionResultGuard } from "./AssertionResultGuard";
import type { TestAssertionIdFactory } from "./TestAssertionIdFactory";

export interface TestSuiteRunTrackerArgs {
  readonly workflow: WorkflowDefinition;
  readonly assertionIdFactory: TestAssertionIdFactory;
  readonly assertionRepo: TestAssertionRepository;
  readonly suiteRepo: TestSuiteRunRepository;
  readonly assertionResultGuard: AssertionResultGuard;
}

/**
 * Per-suite event accumulator: keeps the coverage set, the testCaseIndex map, and persists
 * assertion rows as `nodeCompleted` events arrive. Owned by exactly one `startTestSuiteRun`
 * invocation; no shared mutable state across concurrent suites.
 *
 * Adopted (`adopt`) once the persistence row exists and we know the canonical id — events that
 * arrived before adoption are queued in-memory and replayed on adoption.
 *
 * Two-stage buffering: events arriving before `adopt` are queued globally; once adopted,
 * `nodeCompleted` events for runs we have not yet seen `testCaseStarted` for are queued under
 * `pendingByRunId` and drained when `testCaseStarted` arrives. Without this, fast/inline runners
 * can emit node events synchronously inside `runWorkflow` (before the orchestrator publishes
 * `testCaseStarted`), and assertions/coverage would be silently dropped.
 */
export class TestSuiteRunTracker {
  private adoptedId: string | undefined;
  private readonly testRunCaseIndex = new Map<RunId, number>();
  private readonly nodeCoverage = new Set<NodeId>();
  private readonly pendingEvents: RunEvent[] = [];
  private readonly pendingByRunId = new Map<RunId, RunEvent[]>();

  constructor(private readonly args: TestSuiteRunTrackerArgs) {}

  adopt(testSuiteRunId: string): void {
    this.adoptedId = testSuiteRunId;
    const queued = this.pendingEvents.splice(0, this.pendingEvents.length);
    for (const event of queued) {
      void this.onEvent(event);
    }
  }

  async onEvent(event: RunEvent): Promise<void> {
    if (this.adoptedId === undefined) {
      this.pendingEvents.push(event);
      return;
    }
    switch (event.kind) {
      case "testCaseStarted":
        if (event.testSuiteRunId !== this.adoptedId) return;
        this.testRunCaseIndex.set(event.runId, event.testCaseIndex);
        await this.drainPendingForRun(event.runId);
        return;
      case "testCaseCompleted":
        if (event.testSuiteRunId !== this.adoptedId) return;
        await this.drainPendingForRun(event.runId);
        this.testRunCaseIndex.delete(event.runId);
        this.pendingByRunId.delete(event.runId);
        return;
      case "nodeCompleted":
        if (!this.testRunCaseIndex.has(event.runId)) {
          const queued = this.pendingByRunId.get(event.runId) ?? [];
          queued.push(event);
          this.pendingByRunId.set(event.runId, queued);
          return;
        }
        this.nodeCoverage.add(event.snapshot.nodeId);
        await this.persistAssertionsForCompletedNode(event);
        return;
      default:
        return;
    }
  }

  async finalize(orchestratorResult: TestSuiteRunResult): Promise<void> {
    if (this.adoptedId === undefined) return;
    await this.args.suiteRepo.update(this.adoptedId, {
      status: orchestratorResult.status,
      finishedAt: new Date().toISOString(),
      totalCases: orchestratorResult.totalCases,
      passedCases: orchestratorResult.passedCases,
      failedCases: orchestratorResult.failedCases,
      nodeCoverage: [...this.nodeCoverage],
    });
  }

  private async drainPendingForRun(runId: RunId): Promise<void> {
    const queued = this.pendingByRunId.get(runId);
    if (!queued || queued.length === 0) return;
    this.pendingByRunId.delete(runId);
    for (const event of queued) {
      if (event.kind === "nodeCompleted") {
        this.nodeCoverage.add(event.snapshot.nodeId);
        await this.persistAssertionsForCompletedNode(event);
      }
    }
  }

  private async persistAssertionsForCompletedNode(event: Extract<RunEvent, { kind: "nodeCompleted" }>): Promise<void> {
    if (this.adoptedId === undefined) return;
    const nodeDef = this.args.workflow.nodes.find((n) => n.id === event.snapshot.nodeId);
    if (!nodeDef) return;
    const config = nodeDef.config as NodeConfigBase;
    if (config.emitsAssertions !== true) return;

    const items = event.snapshot.outputs?.main ?? [];
    if (items.length === 0) return;

    if (!this.testRunCaseIndex.has(event.runId)) return;

    for (const item of items) {
      const result = item.json as AssertionResult | undefined;
      if (!this.args.assertionResultGuard.isAssertionResult(result)) {
        continue;
      }
      await this.args.assertionRepo.record({
        id: this.args.assertionIdFactory.makeAssertionId(),
        runId: event.runId,
        testSuiteRunId: this.adoptedId,
        workflowId: event.workflowId,
        nodeId: event.snapshot.nodeId,
        name: result.name,
        status: result.status,
        ...(result.score !== undefined ? { score: result.score } : {}),
        ...(result.expected !== undefined ? { expected: result.expected as JsonValue } : {}),
        ...(result.actual !== undefined ? { actual: result.actual as JsonValue } : {}),
        ...(result.message !== undefined ? { message: result.message } : {}),
        ...(result.details !== undefined ? { details: result.details } : {}),
        createdAt: event.at,
      });
    }
  }
}
