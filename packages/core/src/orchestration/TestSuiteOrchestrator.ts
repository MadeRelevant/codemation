import type { CredentialResolverFactory } from "../execution/CredentialResolverFactory";
import type { RunEventBus, TestCaseRunStatus, TestSuiteRunStatus } from "../events/runEvents";
import type {
  Item,
  Items,
  NodeId,
  ParentExecutionRef,
  RunExecutionOptions,
  RunId,
  RunResult,
  TestSuiteRunId,
  TestTriggerNodeConfig,
  TestTriggerSetupContext,
  TriggerNodeConfig,
  WorkflowDefinition,
  WorkflowId,
} from "../types";

import type { AbortControllerFactory } from "./AbortControllerFactory";
import { TestSuiteRunIdFactory } from "./TestSuiteRunIdFactory";

const DEFAULT_CONCURRENCY = 4;

/**
 * Engine-facade subset the orchestrator needs. Kept narrow on purpose so unit tests can
 * substitute a fake without depending on the full Engine wiring.
 */
export interface TestSuiteOrchestratorEngine {
  runWorkflow(
    wf: WorkflowDefinition,
    startAt: NodeId,
    items: Items,
    parent?: ParentExecutionRef,
    executionOptions?: RunExecutionOptions,
  ): Promise<RunResult>;
  waitForCompletion(runId: RunId): Promise<Extract<RunResult, { status: "completed" | "failed" }>>;
}

export interface TestSuiteCaseOutcome {
  readonly testCaseIndex: number;
  readonly runId: RunId;
  readonly status: TestCaseRunStatus;
}

export interface TestSuiteRunResult {
  readonly testSuiteRunId: TestSuiteRunId;
  readonly workflowId: WorkflowId;
  readonly triggerNodeId: NodeId;
  readonly status: TestSuiteRunStatus;
  readonly totalCases: number;
  readonly passedCases: number;
  readonly failedCases: number;
  readonly cases: ReadonlyArray<TestSuiteCaseOutcome>;
}

export interface RunTestSuiteArgs {
  readonly workflow: WorkflowDefinition;
  readonly triggerNodeId: NodeId;
  readonly testSuiteRunId?: TestSuiteRunId;
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
}

/**
 * Drives a {@link TestTriggerNodeConfig.generateItems} iterable into one workflow run per item,
 * with bounded concurrency. Pure engine logic — no persistence, no HTTP, no UI. Hosts adapt by
 * subscribing to {@link RunEventBus} and writing rows on `testSuite*` / `testCase*` / `nodeCompleted`.
 *
 * Cancellation: the supplied `AbortSignal` aborts the source iterable (so credentialed pulls bail)
 * and stops scheduling further cases. In-flight cases are awaited; engine-level cancellation of
 * an already-dispatched run is not yet wired (Phase 2).
 */
export class TestSuiteOrchestrator {
  constructor(
    private readonly engine: TestSuiteOrchestratorEngine,
    private readonly testSuiteRunIdFactory: TestSuiteRunIdFactory,
    private readonly credentialResolverFactory: CredentialResolverFactory,
    private readonly abortControllerFactory: AbortControllerFactory,
    private readonly eventBus: RunEventBus | undefined,
    private readonly currentDate: () => Date = () => new Date(),
  ) {}

  async runSuite(args: RunTestSuiteArgs): Promise<TestSuiteRunResult> {
    const triggerNodeId = args.triggerNodeId;
    const definition = args.workflow.nodes.find((n) => n.id === triggerNodeId);
    if (!definition) {
      throw new Error(`Unknown trigger nodeId: ${triggerNodeId}`);
    }
    if (definition.kind !== "trigger") {
      throw new Error(`Node ${triggerNodeId} is not a trigger`);
    }
    const triggerConfig = definition.config as TriggerNodeConfig;
    if (triggerConfig.triggerKind !== "test") {
      throw new Error(
        `Node ${triggerNodeId} is not a test trigger (triggerKind="${triggerConfig.triggerKind ?? "live"}")`,
      );
    }
    const testTriggerConfig = triggerConfig as TestTriggerNodeConfig<unknown>;
    if (typeof testTriggerConfig.generateItems !== "function") {
      throw new Error(`Test trigger ${triggerNodeId} is missing a generateItems implementation`);
    }

    const testSuiteRunId = args.testSuiteRunId ?? this.testSuiteRunIdFactory.makeTestSuiteRunId();
    const concurrency = Math.max(1, args.concurrency ?? testTriggerConfig.concurrency ?? DEFAULT_CONCURRENCY);
    const externalSignal = args.signal;
    const internalAbort = this.abortControllerFactory.create();
    const onExternalAbort = () => internalAbort.abort(externalSignal?.reason);
    if (externalSignal) {
      if (externalSignal.aborted) {
        internalAbort.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }

    const triggerNodeName = definition.name ?? testTriggerConfig.name;

    await this.publish({
      kind: "testSuiteStarted",
      testSuiteRunId,
      workflowId: args.workflow.id,
      triggerNodeId,
      ...(triggerNodeName ? { triggerNodeName } : {}),
      concurrency,
      at: this.now(),
    });

    const setupContext: TestTriggerSetupContext = {
      workflowId: args.workflow.id,
      nodeId: triggerNodeId,
      config: testTriggerConfig,
      testSuiteRunId,
      getCredential: this.credentialResolverFactory.create(args.workflow.id, triggerNodeId, testTriggerConfig),
      signal: internalAbort.signal,
    };

    const cases: TestSuiteCaseOutcome[] = [];
    let nextIndex = 0;
    let inFlight = 0;
    let waitForSlot: Promise<void> | undefined;
    let releaseSlot: (() => void) | undefined;
    const queue: Array<Promise<void>> = [];
    let generationError: Error | undefined;

    const acquireSlot = async (): Promise<void> => {
      while (inFlight >= concurrency) {
        if (!waitForSlot) {
          waitForSlot = new Promise<void>((resolve) => {
            releaseSlot = resolve;
          });
        }
        await waitForSlot;
      }
      inFlight += 1;
    };

    const release = (): void => {
      inFlight -= 1;
      if (releaseSlot) {
        const fn = releaseSlot;
        releaseSlot = undefined;
        waitForSlot = undefined;
        fn();
      }
    };

    try {
      for await (const item of testTriggerConfig.generateItems(setupContext) as AsyncIterable<Item<unknown>>) {
        if (internalAbort.signal.aborted) {
          break;
        }
        await acquireSlot();
        if (internalAbort.signal.aborted) {
          release();
          break;
        }
        const testCaseIndex = nextIndex++;
        const testCaseLabel = this.resolveCaseLabel(testTriggerConfig, item);
        queue.push(
          this.runOneCase({
            workflow: args.workflow,
            triggerNodeId,
            testSuiteRunId,
            testCaseIndex,
            testCaseLabel,
            item,
          })
            .then((outcome) => {
              cases.push(outcome);
            })
            .finally(release),
        );
      }
    } catch (err) {
      generationError = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }

    await Promise.all(queue);

    cases.sort((a, b) => a.testCaseIndex - b.testCaseIndex);
    const totalCases = cases.length;
    const passedCases = cases.filter((c) => c.status === "succeeded").length;
    const failedCases = cases.filter((c) => c.status === "failed").length;
    const status: TestSuiteRunStatus = this.deriveSuiteStatus({
      generationError,
      cancelled: internalAbort.signal.aborted,
      totalCases,
      passedCases,
      failedCases,
    });

    await this.publish({
      kind: "testSuiteFinished",
      testSuiteRunId,
      workflowId: args.workflow.id,
      status,
      totalCases,
      passedCases,
      failedCases,
      at: this.now(),
    });

    if (generationError && status === "errored") {
      throw generationError;
    }

    return {
      testSuiteRunId,
      workflowId: args.workflow.id,
      triggerNodeId,
      status,
      totalCases,
      passedCases,
      failedCases,
      cases,
    };
  }

  private async runOneCase(args: {
    workflow: WorkflowDefinition;
    triggerNodeId: NodeId;
    testSuiteRunId: TestSuiteRunId;
    testCaseIndex: number;
    testCaseLabel: string | undefined;
    item: Item<unknown>;
  }): Promise<TestSuiteCaseOutcome> {
    const executionOptions: RunExecutionOptions = {
      testContext: {
        testSuiteRunId: args.testSuiteRunId,
        testCaseIndex: args.testCaseIndex,
        ...(args.testCaseLabel !== undefined ? { testCaseLabel: args.testCaseLabel } : {}),
      },
    };

    const initial = await this.engine.runWorkflow(
      args.workflow,
      args.triggerNodeId,
      [args.item],
      undefined,
      executionOptions,
    );

    const runId = initial.runId;
    await this.publish({
      kind: "testCaseStarted",
      testSuiteRunId: args.testSuiteRunId,
      testCaseIndex: args.testCaseIndex,
      runId,
      workflowId: args.workflow.id,
      at: this.now(),
      ...(args.testCaseLabel !== undefined ? { testCaseLabel: args.testCaseLabel } : {}),
    });

    let terminal: Extract<RunResult, { status: "completed" | "failed" }>;
    if (initial.status === "completed" || initial.status === "failed") {
      terminal = initial;
    } else {
      terminal = await this.engine.waitForCompletion(runId);
    }

    // RunResult.status from the engine narrows to "completed" | "failed" here; widening to
    // "errored" / "cancelled" happens outside this code path (tracker downgrade for assertion
    // failures; outer abort handling for cancelled).
    const status: TestCaseRunStatus = terminal.status === "completed" ? "succeeded" : "failed";
    await this.publish({
      kind: "testCaseCompleted",
      testSuiteRunId: args.testSuiteRunId,
      testCaseIndex: args.testCaseIndex,
      runId,
      workflowId: args.workflow.id,
      status,
      at: this.now(),
    });
    return { testCaseIndex: args.testCaseIndex, runId, status };
  }

  private deriveSuiteStatus(args: {
    generationError: Error | undefined;
    cancelled: boolean;
    totalCases: number;
    passedCases: number;
    failedCases: number;
  }): TestSuiteRunStatus {
    if (args.generationError && args.totalCases === 0) {
      return "errored";
    }
    if (args.cancelled) {
      return "cancelled";
    }
    if (args.generationError) {
      return "errored";
    }
    if (args.totalCases === 0) {
      return "succeeded";
    }
    if (args.failedCases === 0) {
      return "succeeded";
    }
    if (args.passedCases === 0) {
      return "failed";
    }
    return "partial";
  }

  private now(): string {
    return this.currentDate().toISOString();
  }

  /** Defensive label resolver — author-supplied callbacks throw / return non-strings; we tolerate both. */
  private resolveCaseLabel(config: TestTriggerNodeConfig<unknown>, item: Item<unknown>): string | undefined {
    if (typeof config.caseLabel !== "function") return undefined;
    try {
      const result = config.caseLabel(item);
      if (typeof result !== "string") return undefined;
      const trimmed = result.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    } catch {
      return undefined;
    }
  }

  private async publish(event: Parameters<RunEventBus["publish"]>[0]): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish(event);
  }
}
