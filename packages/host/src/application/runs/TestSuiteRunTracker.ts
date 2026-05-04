import type {
  AssertionResult,
  JsonValue,
  NodeConfigBase,
  NodeId,
  RunEvent,
  RunId,
  TestCaseRunStatus,
  TestSuiteRunStatus,
  WorkflowDefinition,
} from "@codemation/core";
import { deriveAssertionPassed } from "@codemation/core";

import type { TestSuiteRunResult } from "@codemation/core/bootstrap";

import type { TestAssertionRepository } from "../../domain/runs/TestAssertionRepository";
import type { TestSuiteRunRepository } from "../../domain/runs/TestSuiteRunRepository";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import type { AssertionResultGuard } from "./AssertionResultGuard";
import type { TestAssertionIdFactory } from "./TestAssertionIdFactory";

export interface TestSuiteRunTrackerArgs {
  readonly workflow: WorkflowDefinition;
  readonly assertionIdFactory: TestAssertionIdFactory;
  readonly assertionRepo: TestAssertionRepository;
  readonly suiteRepo: TestSuiteRunRepository;
  readonly runRepo: WorkflowRunRepository;
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
  /** Track whether any assertion failed for each case run. */
  private readonly failedAssertionsByRunId = new Map<RunId, boolean>();
  /**
   * Tail of the per-tracker event-processing chain. The bus invokes our subscriber as
   * `void tracker.onEvent(event)` (fire-and-forget), so without serialization, finalize()
   * could read `listChildRuns` BEFORE the last `testCaseCompleted` had finished its
   * `updateTestCaseStatus` write — leaving one row stuck on `"running"` and the suite
   * counters off by one. We chain every `processEvent` onto this tail and `finalize` awaits
   * it, draining all in-flight handlers before computing the rollup.
   */
  private processingTail: Promise<void> = Promise.resolve();

  constructor(private readonly args: TestSuiteRunTrackerArgs) {}

  adopt(testSuiteRunId: string): void {
    this.adoptedId = testSuiteRunId;
    const queued = this.pendingEvents.splice(0, this.pendingEvents.length);
    for (const event of queued) {
      void this.onEvent(event);
    }
  }

  /**
   * Public entry-point invoked by the bus subscriber. Serializes handlers through
   * `processingTail` so `finalize` can await all of them. Handlers themselves stay in
   * `processEvent` and don't see the tail bookkeeping.
   */
  onEvent(event: RunEvent): Promise<void> {
    const next = this.processingTail.then(async () => {
      await this.processEvent(event);
    });
    // Swallow rejections at the tail so a single handler failure doesn't poison subsequent
    // events (or wedge `finalize` on a rejected promise). Real handlers shouldn't throw.
    this.processingTail = next.catch(() => undefined);
    return next;
  }

  private async processEvent(event: RunEvent): Promise<void> {
    if (this.adoptedId === undefined) {
      this.pendingEvents.push(event);
      return;
    }
    switch (event.kind) {
      case "testCaseStarted":
        if (event.testSuiteRunId !== this.adoptedId) return;
        this.testRunCaseIndex.set(event.runId, event.testCaseIndex);
        this.failedAssertionsByRunId.set(event.runId, false);
        await this.persistCaseStarted(event);
        await this.drainPendingForRun(event.runId);
        return;
      case "testCaseCompleted":
        if (event.testSuiteRunId !== this.adoptedId) return;
        await this.drainPendingForRun(event.runId);
        await this.persistCaseCompleted(event);
        this.testRunCaseIndex.delete(event.runId);
        this.pendingByRunId.delete(event.runId);
        // KEEP `failedAssertionsByRunId.get(event.runId)` — `finalize` reads it to derive the
        // suite-level pass/fail counters in the in-memory fallback path (when `listChildRuns`
        // returns empty for stub-engine unit tests). The map is per-suite (one tracker per
        // suite run) so retaining ~one boolean per case is bounded growth.
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

    // Drain any in-flight event handlers — the bus invokes us fire-and-forget, so the last
    // `testCaseCompleted` may still be writing `testCaseStatus` when the orchestrator's
    // `runSuite` resolves. Without this await, `listChildRuns` below races and one row
    // stays pinned on `"running"`.
    await this.processingTail;

    // The orchestrator's pass/fail counts are pre-assertion-rollup. Since the tracker
    // may have downgraded some "succeeded" cases to "failed" based on assertion failures,
    // we need to recount from the child runs. This ensures the suite-level counters reflect
    // the final case statuses.
    //
    // When `listChildRuns` returns nothing (in-memory unit-test adapter, by design — see
    // InMemoryTestSuiteRunRepository), fall back to the orchestrator's own counts adjusted by
    // our local `failedAssertionsByRunId` accumulator. Without this fallback, suites driven by
    // a stub engine + in-memory repos would always see `passedCases=0, failedCases=0`.
    const childRuns = await this.args.suiteRepo.listChildRuns(this.adoptedId);
    let passedCases: number;
    let failedCases: number;
    if (childRuns.length > 0) {
      passedCases = childRuns.filter((r) => r.testCaseStatus === "succeeded").length;
      failedCases = childRuns.filter((r) => r.testCaseStatus === "failed").length;
    } else {
      const failedFromAssertions = [...this.failedAssertionsByRunId.values()].filter(Boolean).length;
      // failed = orchestrator-reported fails ∪ assertion-rollup downgrades. The orchestrator-
      // failed runs may already overlap with assertion-failed runs, but in the in-memory path
      // we don't have per-run status, so we approximate by taking the max — a downgrade can
      // only push a "passed" case to "failed", never the reverse.
      failedCases = Math.max(orchestratorResult.failedCases, failedFromAssertions);
      passedCases = Math.max(0, orchestratorResult.totalCases - failedCases);
    }

    // The orchestrator derives suite status against its OWN pre-rollup pass/fail counts —
    // so a 16/14 split that the tracker re-counted from corrected case statuses would still
    // show as "succeeded" if the orchestrator never saw a workflow-run-level failure.
    // Re-derive here against the corrected counts, but preserve the orchestrator's terminal
    // status when it carries information the counts can't (errored from generateItems throwing,
    // cancelled from an AbortSignal — neither shows up as "failed cases").
    const status: TestSuiteRunStatus =
      orchestratorResult.status === "errored" || orchestratorResult.status === "cancelled"
        ? orchestratorResult.status
        : this.deriveSuiteStatusFromCounts(orchestratorResult.totalCases, passedCases, failedCases);

    await this.args.suiteRepo.update(this.adoptedId, {
      status,
      finishedAt: new Date().toISOString(),
      totalCases: orchestratorResult.totalCases,
      passedCases,
      failedCases,
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

  private async persistCaseStarted(event: Extract<RunEvent, { kind: "testCaseStarted" }>): Promise<void> {
    if (this.adoptedId === undefined) return;
    if (!this.args.runRepo.updateTestCaseStatus) return;
    try {
      await this.args.runRepo.updateTestCaseStatus(event.runId, "running");
    } catch {
      // If the run doesn't exist yet, that's okay — it will be created by the engine
      // and this is just a best-effort write for early visibility.
    }
  }

  private async persistCaseCompleted(event: Extract<RunEvent, { kind: "testCaseCompleted" }>): Promise<void> {
    if (this.adoptedId === undefined) return;
    if (!this.args.runRepo.updateTestCaseStatus) return;

    // Determine final case status: assertion rollup overrides the orchestrator's status
    let finalStatus: TestCaseRunStatus = event.status;

    // If orchestrator says "succeeded" but we saw a failed assertion, downgrade to "failed"
    if (event.status === "succeeded" && this.failedAssertionsByRunId.get(event.runId)) {
      finalStatus = "failed";
    }

    // Preserve "errored" and "cancelled" states as-is (higher priority than assertions)
    // "failed" from orchestrator is already correct

    await this.args.runRepo.updateTestCaseStatus(event.runId, finalStatus);
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

      // Track if any assertion failed (or errored) for this run. Pass/fail derives from
      // score + threshold; an `errored: true` flag is treated as a hard fail regardless of score.
      if (!deriveAssertionPassed(result)) {
        this.failedAssertionsByRunId.set(event.runId, true);
      }

      await this.args.assertionRepo.record({
        id: this.args.assertionIdFactory.makeAssertionId(),
        runId: event.runId,
        testSuiteRunId: this.adoptedId,
        workflowId: event.workflowId,
        nodeId: event.snapshot.nodeId,
        name: result.name,
        score: result.score,
        ...(result.passThreshold !== undefined ? { passThreshold: result.passThreshold } : {}),
        ...(result.errored === true ? { errored: true as const } : {}),
        ...(result.expected !== undefined ? { expected: result.expected as JsonValue } : {}),
        ...(result.actual !== undefined ? { actual: result.actual as JsonValue } : {}),
        ...(result.message !== undefined ? { message: result.message } : {}),
        ...(result.details !== undefined ? { details: result.details } : {}),
        createdAt: event.at,
      });
    }
  }

  /**
   * Mirrors `TestSuiteOrchestrator.deriveSuiteStatus` but operates on the corrected
   * (post-assertion-rollup) pass/fail counts. Preserves the orchestrator's `errored`
   * and `cancelled` decisions upstream — those carry information the counts can't.
   */
  private deriveSuiteStatusFromCounts(
    totalCases: number,
    passedCases: number,
    failedCases: number,
  ): TestSuiteRunStatus {
    if (totalCases === 0) return "succeeded";
    if (failedCases === 0) return "succeeded";
    if (passedCases === 0) return "failed";
    return "partial";
  }
}
