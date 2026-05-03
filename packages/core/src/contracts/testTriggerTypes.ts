import type { Item, NodeId, WorkflowId } from "./workflowTypes";
import type { TriggerNodeConfig } from "./workflowTypes";

/**
 * Identifier minted by the host (or in-memory test runner) for one execution of a test suite.
 * One TestSuiteRun produces N child workflow runs, one per item yielded by `generateItems`.
 */
export type TestSuiteRunId = string;

/**
 * Setup context passed to a {@link TestTriggerNodeConfig.generateItems} callback. Distinct from
 * {@link import("./runtimeTypes").TriggerSetupContext} on purpose: test triggers are not
 * activated by the live trigger lifecycle (webhooks, cron, polling) and never call `emit` —
 * the orchestrator pulls from the iterable they return and dispatches one run per item.
 */
export interface TestTriggerSetupContext<
  TConfig extends TestTriggerNodeConfig<unknown> = TestTriggerNodeConfig<unknown>,
> {
  readonly workflowId: WorkflowId;
  readonly nodeId: NodeId;
  readonly config: TConfig;
  readonly testSuiteRunId: TestSuiteRunId;
  /**
   * Resolves a credential session for a slot declared on this trigger's
   * {@link import("./workflowTypes").NodeConfigBase.getCredentialRequirements}. Same contract as
   * {@link import("./runtimeTypes").ExecutionContext.getCredential}.
   */
  getCredential<TSession = unknown>(slotKey: string): Promise<TSession>;
  /** AbortSignal raised when the suite is cancelled — long-running pulls should bail out. */
  readonly signal: AbortSignal;
}

/**
 * A trigger config that emits **test cases**. Each item yielded by {@link generateItems}
 * becomes one workflow run (with `executionOptions.testContext` set), so 10 yielded items
 * → 10 runs marked under the same TestSuiteRun.
 *
 * The trigger is otherwise a normal {@link TriggerNodeConfig} (so the canvas treats it like
 * any other trigger), but its `triggerKind` is `"test"` so the live activation policy skips it.
 */
export interface TestTriggerNodeConfig<TOutputJson = unknown> extends TriggerNodeConfig<TOutputJson, undefined> {
  readonly triggerKind: "test";
  /**
   * Author-supplied async iterable of items, evaluated lazily. Implementations may fetch from
   * credentialed APIs, read fixture files, or yield hard-coded items. The orchestrator iterates
   * and dispatches one run per item, with concurrency capped by {@link concurrency} (default 4).
   */
  generateItems(ctx: TestTriggerSetupContext<TestTriggerNodeConfig<TOutputJson>>): AsyncIterable<Item<TOutputJson>>;
  /** Per-suite-run cap on simultaneously-executing test cases. Default: 4. */
  readonly concurrency?: number;
  /**
   * Free-form description of where the test cases come from — surfaced in the node properties
   * panel and the suite-detail header so authors revisiting the workflow six months later
   * remember which mailbox / folder / fixture file the cases originate from.
   *
   * Example: `"All emails in the Gmail label \"test/triage-fixtures\" — 14 messages as of 2026-05-03."`
   */
  readonly description?: string;
  /**
   * Resolves a human-readable label for one yielded test case (e.g. email subject). The
   * orchestrator calls this once per yielded item, persists the result on the run, and the
   * Tests-tab UI uses it to render the case row instead of the opaque runId. Return
   * `undefined` to fall back to "Case #N".
   */
  caseLabel?(item: Item<TOutputJson>): string | undefined;
}
