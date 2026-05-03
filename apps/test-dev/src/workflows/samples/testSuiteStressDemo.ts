/**
 * Demo: end-to-end **stress** test of the Workflow Testing primitive — designed so all the
 * moving parts are visible at once.
 *
 *   ┌──────────────────────┐
 *   │ TestTrigger (30 cases)│ ─────┐
 *   └──────────────────────┘       │
 *                                  ▼
 *   ┌──────────────────────┐    ┌─────────────────────┐    ┌──────────────────────────┐    ┌─────────────┐
 *   │ ManualTrigger (1)    │ ──▶│ Random 1-5s delay   │ ──▶│ Process (~30% wrong-out) │ ──▶│ IsTestRun?  │
 *   └──────────────────────┘    └─────────────────────┘    └──────────────────────────┘    └─────┬──┬────┘
 *                                                                                            true│  │false
 *                                                                                                ▼  ▼
 *                                                                                  Assertion       NoOp
 *
 * - Concurrency 4 (orchestrator default) — at most 4 cases run in parallel; the rest queue.
 * - Each case waits 1-5s in the delay node, so cases stream visibly through the inspector.
 * - ~30% of cases produce wrong output (without throwing) so the assertion catches them as
 *   `fail` rows; failing the WORKFLOW (a thrown error) would skip the assertion entirely and
 *   produce a less useful run-level fail with no assertion data.
 * - The same workflow has a parallel ManualTrigger so `Run workflow` on the canvas exercises
 *   the live path (IsTestRun → false branch) without spinning up a TestSuiteRun.
 * - `caseLabel(item)` produces a per-case label (mirroring how a real workflow loading emails
 *   would expose the email subject) so the Tests-tab tree-table is readable.
 */
import type { NodeDefinition, WorkflowDefinition } from "@codemation/core";
import { Assertion, Callback, IsTestRun, ManualTrigger, NoOp, TestTrigger } from "@codemation/core-nodes";

interface StressCase {
  readonly idx: number;
  readonly expectedSum: number;
  readonly source: "test" | "manual";
}

interface ProcessedCase extends StressCase {
  readonly computedSum: number;
  readonly succeeded: boolean;
}

const FAILURE_PROBABILITY = 0.3;
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 5000;

const testTrigger = new TestTrigger<StressCase>({
  name: "30 fixture cases",
  id: "test_trigger",
  description:
    "30 hardcoded test cases (idx 0..29) generated inline. The processing node produces wrong " +
    "output for ~30% of items at random, and the assertion checks computedSum === expectedSum. " +
    "Used to demo concurrency-4 streaming through a 1-5s delay so each test case is visibly in flight.",
  async *generateItems() {
    for (let idx = 0; idx < 30; idx++) {
      yield { json: { idx, expectedSum: idx + 1, source: "test" } };
    }
  },
  // Per-case readable label for the Tests-tab tree-table — mirrors how a real workflow loading
  // emails would expose the email subject ("RFQ for batch 14") instead of the opaque runId.
  caseLabel: (item) => `Stress case #${item.json.idx} (expects sum=${item.json.expectedSum})`,
});

const manualTrigger = new ManualTrigger<StressCase>(
  "Manual: live entry",
  [{ json: { idx: 999, expectedSum: 1000, source: "manual" } }],
  "manual_trigger",
);

const randomDelayNode = new Callback<StressCase, StressCase>(
  "Random 1-5s delay",
  async (items) => {
    const ms = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
    await new Promise((resolve) => setTimeout(resolve, ms));
    return items;
  },
  "random_delay",
);

const processNode = new Callback<StressCase, ProcessedCase>(
  "Process (random ~30% wrong-output)",
  async (items) =>
    items.map((item) => {
      const succeeded = Math.random() >= FAILURE_PROBABILITY;
      // Inject a wrong sum on failures so the assertion downstream catches it as a `fail`
      // (rather than throwing here, which would short-circuit the run and skip the assertion
      // entirely — producing a run-level fail with no assertion data).
      const computedSum = succeeded ? item.json.idx + 1 : item.json.idx + 999;
      return { json: { ...item.json, computedSum, succeeded } };
    }),
  "process",
);

const isTestRunNode = new IsTestRun("Is this a test run?", "is_test_run");

const assertionNode = new Assertion<ProcessedCase>({
  name: "Validate computed sum",
  id: "assertions",
  assertions: (item) => [
    {
      name: "computedSum matches expectedSum",
      status: item.json.computedSum === item.json.expectedSum ? "pass" : "fail",
      expected: item.json.expectedSum,
      actual: item.json.computedSum,
      message: item.json.succeeded ? undefined : `Process produced wrong output for idx=${item.json.idx}`,
    },
  ],
});

const liveNoOpNode = new NoOp("Live continuation (no real side effect)", "live_noop");

function asNode(config: {
  kind: "trigger" | "node";
  type: NodeDefinition["type"];
  id?: string;
  name?: string;
}): NodeDefinition {
  return {
    id: config.id ?? `${String(config.type)}:${Math.random().toString(36).slice(2, 8)}`,
    kind: config.kind,
    type: config.type,
    name: config.name,
    config: config as unknown as NodeDefinition["config"],
  };
}

const stressWorkflow: WorkflowDefinition = {
  id: "wf.test-dev.test-suite-stress",
  name: "Test suite stress (30 items + delay + random fails)",
  nodes: [
    asNode(testTrigger),
    asNode(manualTrigger),
    asNode(randomDelayNode),
    asNode(processNode),
    asNode(isTestRunNode),
    asNode(assertionNode),
    asNode(liveNoOpNode),
  ],
  edges: [
    { from: { nodeId: "test_trigger", output: "main" }, to: { nodeId: "random_delay", input: "in" } },
    { from: { nodeId: "manual_trigger", output: "main" }, to: { nodeId: "random_delay", input: "in" } },
    { from: { nodeId: "random_delay", output: "main" }, to: { nodeId: "process", input: "in" } },
    { from: { nodeId: "process", output: "main" }, to: { nodeId: "is_test_run", input: "in" } },
    { from: { nodeId: "is_test_run", output: "true" }, to: { nodeId: "assertions", input: "in" } },
    { from: { nodeId: "is_test_run", output: "false" }, to: { nodeId: "live_noop", input: "in" } },
  ],
};

export default stressWorkflow;
