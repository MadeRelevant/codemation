import {
  inject,
  injectable,
  type NodeId,
  type RunEventBus,
  type RunEventSubscription,
  type TestSuiteRunId,
  type TriggerNodeConfig,
  type TypeToken,
  type WorkflowDefinition,
  type WorkflowId,
} from "@codemation/core";

import { TestSuiteOrchestrator } from "@codemation/core/bootstrap";

import type {
  TestSuiteChildRunSummary,
  TestSuiteRunRecord,
  TestSuiteRunRepository,
} from "../../domain/runs/TestSuiteRunRepository";

import { TestSuiteRunRepositoryToken, TestSuiteRunTrackerFactory } from "./TestSuiteRunTrackerFactory";

/** Looks up a workflow by id at the moment of `startTestSuiteRun`. Host-provided. */
export interface TestRunnerWorkflowLookup {
  resolveWorkflow(workflowId: WorkflowId): WorkflowDefinition | undefined;
}

export const TestRunnerWorkflowLookupToken = Symbol.for(
  "codemation.application.testing.TestRunnerWorkflowLookup",
) as unknown as TypeToken<TestRunnerWorkflowLookup>;

export const TestRunnerEventBusToken = Symbol.for(
  "codemation.application.testing.TestRunnerEventBus",
) as unknown as TypeToken<RunEventBus>;

/**
 * Returned **early** to the HTTP layer — before the orchestrator finishes — so the UI can
 * immediately navigate to the suite-detail view and watch progress via realtime events. The
 * orchestrator runs in the background; its terminal `TestSuiteRunResult` is delivered through
 * the eventBus (`testSuiteFinished`) and persisted by the tracker.
 */
export interface StartTestSuiteRunResult {
  readonly testSuiteRunId: TestSuiteRunId;
  /** Always `"running"` here — the suite hasn't finished when the response is built. */
  readonly status: "running";
}

/**
 * Composes:
 *   1) creating + finalizing a `TestSuiteRun` Prisma row,
 *   2) running the engine-level `TestSuiteOrchestrator`,
 *   3) persisting one `TestAssertion` row per emitted assertion item, and
 *   4) accumulating node coverage.
 *
 * Subscribes to {@link RunEventBus} only for the lifetime of one suite run — there is no
 * background subscriber. This keeps state ownership clear: each invocation maintains its own
 * in-memory `runId → testCaseIndex` map (inside the Tracker), releases it on finish, and does
 * not interfere with concurrent suite runs (each subscribes independently and filters by
 * `testSuiteRunId`).
 */
@injectable()
export class TestRunnerService {
  constructor(
    @inject(TestSuiteOrchestrator) private readonly orchestrator: TestSuiteOrchestrator,
    @inject(TestRunnerWorkflowLookupToken) private readonly workflowLookup: TestRunnerWorkflowLookup,
    @inject(TestRunnerEventBusToken) private readonly eventBus: RunEventBus,
    @inject(TestSuiteRunRepositoryToken) private readonly suiteRepo: TestSuiteRunRepository,
    @inject(TestSuiteRunTrackerFactory) private readonly trackerFactory: TestSuiteRunTrackerFactory,
  ) {}

  async startTestSuiteRun(args: {
    workflowId: WorkflowId;
    triggerNodeId: NodeId;
    concurrency?: number;
    signal?: AbortSignal;
  }): Promise<StartTestSuiteRunResult> {
    const workflow = this.workflowLookup.resolveWorkflow(args.workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflowId: ${args.workflowId}`);
    }
    const triggerDef = workflow.nodes.find((n) => n.id === args.triggerNodeId);
    if (!triggerDef || triggerDef.kind !== "trigger") {
      throw new Error(`Node ${args.triggerNodeId} is not a trigger`);
    }
    const triggerConfig = triggerDef.config as TriggerNodeConfig;
    if (triggerConfig.triggerKind !== "test") {
      throw new Error(
        `Node ${args.triggerNodeId} is not a test trigger (triggerKind="${triggerConfig.triggerKind ?? "live"}")`,
      );
    }

    const startedAt = new Date().toISOString();
    const placeholderId = `tsr_pending_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const tracker = this.trackerFactory.create({ workflow });

    const subscription: RunEventSubscription = await this.eventBus.subscribeToWorkflow(args.workflowId, (event) => {
      void tracker.onEvent(event);
    });

    // Persistence row exists BEFORE the orchestrator dispatches anything so the UI can poll /
    // realtime-subscribe to it immediately.
    await this.suiteRepo.create({
      id: placeholderId,
      workflowId: workflow.id,
      triggerNodeId: triggerDef.id,
      triggerNodeName: triggerDef.name ?? triggerConfig.name,
      concurrency: args.concurrency ?? 4,
      startedAt,
    });
    tracker.adopt(placeholderId);

    // Fire-and-forget the orchestrator. We capture the resolution / rejection separately so
    // the subscription cleanup runs even when `generateItems` throws, and so a fatal error
    // gets stamped on the suite row (status = errored) without crashing the HTTP request.
    const finalize = async (): Promise<void> => {
      try {
        const orchestratorResult = await this.orchestrator.runSuite({
          workflow,
          triggerNodeId: triggerDef.id,
          testSuiteRunId: placeholderId,
          ...(args.concurrency !== undefined ? { concurrency: args.concurrency } : {}),
          ...(args.signal ? { signal: args.signal } : {}),
        });
        await tracker.finalize(orchestratorResult);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.suiteRepo.update(placeholderId, {
          status: "errored",
          finishedAt: new Date().toISOString(),
          errorMessage: message,
        });
      } finally {
        await subscription.close();
      }
    };
    void finalize();

    return { testSuiteRunId: placeholderId, status: "running" };
  }

  async getTestSuiteRun(id: TestSuiteRunId): Promise<TestSuiteRunRecord | undefined> {
    return await this.suiteRepo.findById(id);
  }

  async listTestSuiteRuns(workflowId: WorkflowId, limit?: number): Promise<ReadonlyArray<TestSuiteRunRecord>> {
    return await this.suiteRepo.listByWorkflow({ workflowId, limit });
  }

  async listChildRuns(testSuiteRunId: TestSuiteRunId): Promise<ReadonlyArray<TestSuiteChildRunSummary>> {
    return await this.suiteRepo.listChildRuns(testSuiteRunId);
  }
}
