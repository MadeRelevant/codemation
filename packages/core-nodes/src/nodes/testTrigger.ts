import type {
  CredentialRequirement,
  Item,
  NodeInspectorSummaryRow,
  TestTriggerNodeConfig,
  TestTriggerSetupContext,
  TypeToken,
} from "@codemation/core";

import { TestTriggerNode } from "./TestTriggerNode";

export interface TestTriggerOptions<TOutputJson> {
  readonly name?: string;
  readonly id?: string;
  readonly icon?: string;
  /** Cap on simultaneous in-flight test cases for one suite run. Default: 4 (orchestrator). */
  readonly concurrency?: number;
  readonly credentialRequirements?: ReadonlyArray<CredentialRequirement>;
  /**
   * Free-form description of where the test cases come from. Shown in the node properties
   * panel and the Tests-tab suite-detail header so authors revisiting the workflow six months
   * later remember which mailbox / folder / fixture file the cases originate from.
   */
  readonly description?: string;
  /**
   * Author callback that yields one item per test case. Items are dispatched as separate
   * workflow runs by the TestSuiteOrchestrator, with `executionOptions.testContext` set.
   * The provided context exposes credential resolution and an AbortSignal for cancellation.
   */
  generateItems(ctx: TestTriggerSetupContext<TestTrigger<TOutputJson>>): AsyncIterable<Item<TOutputJson>>;
  /**
   * Optional resolver: extract a human-readable label from a yielded item. The orchestrator
   * persists this on the run, so the Tests-tab tree-table shows e.g. "RFQ for batch 14"
   * instead of an opaque runId. Typical use: `(item) => item.json.subject` for mailbox tests.
   */
  caseLabel?(item: Item<TOutputJson>): string | undefined;
}

/**
 * Trigger config for a test fixture source. Drop one (or more) of these on the canvas alongside
 * a workflow's live triggers; clicking "Run tests" on the Tests tab invokes
 * {@link TestTriggerOptions.generateItems} via the TestSuiteOrchestrator.
 */
export class TestTrigger<TOutputJson = unknown> implements TestTriggerNodeConfig<TOutputJson> {
  readonly kind = "trigger" as const;
  readonly triggerKind = "test" as const;
  readonly type: TypeToken<unknown> = TestTriggerNode;
  readonly icon: string;
  readonly name: string;
  readonly id?: string;
  readonly concurrency?: number;
  readonly description?: string;
  readonly generateItems: TestTriggerOptions<TOutputJson>["generateItems"];
  readonly caseLabel?: TestTriggerOptions<TOutputJson>["caseLabel"];
  private readonly credentialRequirements: ReadonlyArray<CredentialRequirement>;

  constructor(options: TestTriggerOptions<TOutputJson>) {
    this.name = options.name ?? "Test trigger";
    this.id = options.id;
    this.icon = options.icon ?? "lucide:flask-conical";
    this.concurrency = options.concurrency;
    this.description = options.description;
    this.credentialRequirements = options.credentialRequirements ?? [];
    this.generateItems = options.generateItems;
    this.caseLabel = options.caseLabel;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return this.credentialRequirements;
  }

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> | undefined {
    const rows: NodeInspectorSummaryRow[] = [];
    if (this.description) {
      const desc = this.description.length > 80 ? `${this.description.slice(0, 79)}…` : this.description;
      rows.push({ label: "Description", value: desc });
    }
    if (this.concurrency !== undefined) {
      rows.push({ label: "Concurrency", value: String(this.concurrency) });
    }
    return rows.length > 0 ? rows : undefined;
  }
}

export { TestTriggerNode } from "./TestTriggerNode";
