# Workflow Testing

Codemation has first-class support for end-to-end **workflow tests**: each test case is one full workflow run, persisted with assertion records and node coverage. Use this when you want to validate agent behavior, regression-test branching logic, or score LLM outputs over time — not for unit-testing individual nodes (use `WorkflowTestKit` for that).

## Mental model

| Concept               | Meaning                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TestTrigger**       | A trigger node you drop on the canvas alongside your live triggers (Webhook / Cron / Gmail / etc.). The author callback yields one item per test case.                                                                               |
| **TestSuiteRun**      | One _execution_ of a TestTrigger. If the callback yields 10 items, the TestSuiteRun has 10 child runs.                                                                                                                               |
| **TestRun**           | One workflow run inside a TestSuiteRun, corresponding to one yielded test case. Persisted as a regular `Run` row with `testSuiteRunId` and `testCaseIndex` set.                                                                      |
| **TestAssertion**     | One assertion record produced by an `Assertion`-style node during a TestRun. Many per TestRun.                                                                                                                                       |
| **`ctx.testContext`** | Optional field on the execution context. **Present iff this run is a test case.** Use the `IsTestRun` node to branch on it from the workflow graph; nodes can also read `ctx.testContext?.{testSuiteRunId, testCaseIndex}` directly. |

## Anatomy of a tested workflow

A workflow with both a live Gmail trigger _and_ a TestTrigger sharing the same downstream graph:

```
[GmailTrigger: new email] ──┐
                            │
[TestTrigger: 10 fixtures]──┴─→ [ClassifyAgent]
                                      │
                                [IsTestRun?]
                                  │   │
                              true│   │false
                                  ↓   ↓
                          [Assertion]  [SendReply] (real side effect — skipped in tests)
                          [JudgeBy
                           Agent
                           Assertion]
```

Click **Run tests** on the Tests tab → the orchestrator iterates `generateItems`, dispatches one workflow run per item, the `IsTestRun` node routes each run down the assertion branch, and assertion items get persisted.

## Authoring a TestTrigger

Drop a `TestTrigger` on a workflow alongside your live triggers. The author provides an async iterable of items and (optionally) declares credential requirements.

```ts
import { TestTrigger } from "@codemation/core-nodes";
import { gmailCredentialType, type GmailSession } from "@codemation/core-nodes-gmail";

export const fixtureMailsTrigger = new TestTrigger<{ subject: string; body: string }>({
  name: "Email fixtures",
  credentialRequirements: [
    { slotKey: "gmail", label: "Gmail", acceptedTypes: [gmailCredentialType.definition.typeId] },
  ],
  async *generateItems(ctx) {
    const gmail = await ctx.getCredential<GmailSession>("gmail");
    const messages = await gmail.listMessages({ labelIds: ["Label_test_mails"] });
    for (const message of messages) {
      if (ctx.signal.aborted) break;
      yield { json: { subject: message.subject, body: message.body } };
    }
  },
  // Optional: cap simultaneous in-flight test cases (default: 4)
  concurrency: 8,
  // Optional: human-readable label per case for the Tests-tab tree-table.
  // Without it, rows show the opaque runId.
  caseLabel: (item) => item.json.subject,
});
```

Notes:

- `triggerKind: "test"` is set automatically — the live activation policy (webhooks, cron, polling) skips this trigger. It is **only** invoked by the `TestSuiteOrchestrator`.
- `ctx.signal` is an `AbortSignal` raised when the suite is cancelled. Long pulls should bail out via `if (ctx.signal.aborted) break;`.
- `ctx.getCredential(slotKey)` resolves credentials the same way regular nodes do.
- For unit-style hardcoded fixtures, just `yield { json: { ... } }` directly — no need to use credentials.

## Branching on test runs

The `IsTestRun` node has two output ports — `true` and `false` — and routes per-item based on whether `ctx.testContext` is set on the current run. Use it to skip side-effects when in a test.

```ts
import { IsTestRun } from "@codemation/core-nodes";

const isTestRun = new IsTestRun("Skip side effects in tests");
```

You can also read `ctx.testContext` directly from a custom node's `execute`:

```ts
async execute({ item, ctx }) {
  if (ctx.testContext) {
    // we're in a test; skip the network call, return synthetic output
    return { json: { result: "synthetic-test-output" } };
  }
  return { json: await this.realApi.send(item.json) };
}
```

## Authoring assertions

The `Assertion` node is a generic callback that returns a list of `AssertionResult`s. Each emitted result becomes one output item on `main` _and_ one persisted `TestAssertion` row.

```ts
import { Assertion } from "@codemation/core-nodes";

const checkClassification = new Assertion<{ label: string; confidence: number }>({
  name: "Classification checks",
  assertions: (item) => [
    {
      // Boolean-style: score 1 = pass, 0 = fail. Default threshold (0.5) handles this.
      name: "label is spam",
      score: item.json.label === "spam" ? 1 : 0,
      expected: "spam",
      actual: item.json.label,
    },
    {
      // Continuous-score: declare the threshold explicitly.
      name: "confidence ≥ 0.8",
      score: item.json.confidence,
      passThreshold: 0.8,
      expected: "≥ 0.8",
      actual: item.json.confidence,
    },
  ],
});
```

### `AssertionResult` shape

The persister and chart UIs key off these fields:

```ts
interface AssertionResult {
  readonly name: string;
  /** 0..1 score. Source of truth for pass/fail (compared against `passThreshold`). */
  readonly score: number;
  /** 0..1 threshold for "passed". When omitted, consumers default to 0.5. */
  readonly passThreshold?: number;
  /** True when evaluating the assertion threw — treated as fail regardless of `score`. */
  readonly errored?: true;
  readonly expected?: JsonValue;
  readonly actual?: JsonValue;
  readonly message?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
}
```

**How pass/fail is derived** (canonical, in `@codemation/core`):

```ts
import { deriveAssertionPassed } from "@codemation/core";
// errored ? false : score >= (passThreshold ?? 0.5)
```

Boolean-style assertions emit `score: 1` / `score: 0` so the default `0.5` threshold splits them cleanly. AI-judge assertions are expected to set their own `passThreshold`.

`errored: true` is for cases where the assertion code itself threw (judge agent crashed, JSON parse failed). Surface it explicitly so dashboards can separate "wrong workflow output" from "broken assertion code":

```ts
assertions: async (item, ctx) => {
  try {
    const judgment = await runJudge(item, ctx);
    return [{ name: "polite reply", score: judgment.score, passThreshold: 0.7, message: judgment.reason }];
  } catch (err) {
    return [{ name: "polite reply", score: 0, errored: true, message: String(err) }];
  }
};
```

### Judge-by-Agent assertions

A judge-by-agent is just an AI agent step feeding into an Assertion callback. Run an agent that returns a structured judgment, then map its output to an `AssertionResult`:

```ts
const judgeAssertion = new Assertion({
  name: "Judge: reply tone",
  assertions: async (item, ctx) => {
    const judgment = ctx.data.getOutputItem(politenessJudgeNode, 0)?.json as {
      isPolite: boolean;
      score: number;
      reasoning: string;
    };
    return [
      {
        name: "reply is polite",
        score: judgment.score, // 0..1 from the judge
        passThreshold: 0.7,
        message: judgment.reasoning,
      },
    ];
  },
});
```

## Running tests

### From the canvas UI

Open the workflow detail screen, click the **Tests** tab.

- **Trigger picker** — a dropdown at the top is populated from your workflow's `triggerKind === "test"` nodes. If you have multiple TestTriggers (e.g. "30 fixtures" and "1 stress case"), pick the one to run; the chart and history table filter to that trigger.
- **Run tests** — starts a TestSuiteRun against the selected trigger.
- **Trend chart** — historical runs plotted over time. Use the **metric selector** to chart any combination of: `passRate`, `failedCases`, `passedCases`, `totalCases`, or per-assertion average scores by name. Lines are color-coded per metric.
- **Comparison panel** — clicking a historical run pins it; the next run you click compares assertion scores, pass/fail counts, and node coverage side-by-side. Useful when you change a prompt or model and want to see which cases regressed.
- **Drill-in** — click a row to open a TestSuiteRun → see per-case status (`running` / `succeeded` / `failed` / `errored` / `cancelled`), per-run assertions with `expected` / `actual` JSON viewers, and the score / threshold for each.

### From code (unit / integration tests)

For framework-author tests, use the orchestrator directly:

```ts
import {
  AbortControllerFactory,
  TestSuiteOrchestrator,
  TestSuiteRunIdFactory,
  CredentialResolverFactory,
} from "@codemation/core/bootstrap";

const orchestrator = new TestSuiteOrchestrator(
  engine,
  new TestSuiteRunIdFactory(),
  new CredentialResolverFactory(credentialSessionService),
  new AbortControllerFactory(),
  eventBus, // optional
);

const result = await orchestrator.runSuite({
  workflow,
  triggerNodeId: "fixture-trigger",
});
// result.status: "succeeded" | "failed" | "partial" | "cancelled" | "errored"
```

### From the HTTP API

The host exposes the following endpoints (all behind the standard session-verifier middleware):

| Method | Path                                         | Body / response                                                                                              |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST` | `/api/workflows/:workflowId/test-suite-runs` | `{ triggerNodeId, concurrency? }` → `{ testSuiteRunId, status, totalCases, passedCases, failedCases }` (201) |
| `GET`  | `/api/workflows/:workflowId/test-suite-runs` | list of `TestSuiteRunSummaryDto`                                                                             |
| `GET`  | `/api/test-suite-runs/:id`                   | `TestSuiteRunDetailDto`                                                                                      |
| `GET`  | `/api/test-suite-runs/:id/assertions`        | all `TestAssertionDto` for the suite                                                                         |
| `GET`  | `/api/runs/:runId/assertions`                | per-run `TestAssertionDto[]`                                                                                 |

Helpers in `ApiPaths` (host) and `realtimeApi.ts` (next-host) cover all of these.

## Persistence shape

| Table            | Purpose                      | Key fields                                                                                                                                                                                                                         |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TestSuiteRun`   | One per executed test suite. | `id`, `workflowId`, `triggerNodeId`, `triggerNodeName` (snapshotted so renames don't orphan UI), `status`, `concurrency`, `totalCases`, `passedCases`, `failedCases`, `nodeCoverageJson`                                           |
| `Run` (extended) | One per test case.           | New: `testSuiteRunId?` (FK + index), `testCaseIndex?`, `testCaseStatus?` — `running` while in flight, then `succeeded` / `failed` / `errored` / `cancelled`. `failed` reflects assertion-rollup, not just a thrown workflow error. |
| `TestAssertion`  | One per assertion result.    | `id`, `runId`, `testSuiteRunId`, `nodeId`, `iterationId?`, `itemIndex?`, `name`, `score`, `passThreshold?`, `errored?`, `expectedJson?`, `actualJson?`, `message?`, `detailsJson?`, `createdAt`                                    |

The workflow definition itself is **not** FK'd — workflows live in code, not in DB. `TestSuiteRun.triggerNodeName` is snapshotted so historical viewing survives rename / delete of the trigger node, mirroring how `Run.workflowSnapshotJson` already works.

## Status state machines

### Per-case (`Run.testCaseStatus`)

| Status      | Meaning                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `running`   | Workflow run dispatched, not yet finished.                                                                                              |
| `succeeded` | Workflow completed AND every assertion passed (score ≥ threshold, no `errored`).                                                        |
| `failed`    | Workflow completed but at least one assertion failed (score < threshold OR `errored: true`), OR the workflow itself reported a failure. |
| `errored`   | Workflow run threw before reaching a terminal state (engine error, not an assertion).                                                   |
| `cancelled` | The suite's `AbortSignal` fired before this case completed.                                                                             |

### Suite (`TestSuiteRun.status`)

| Status      | Meaning                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `running`   | Still executing (transient).                                                 |
| `succeeded` | All cases passed (or zero cases yielded by the trigger).                     |
| `failed`    | Every case failed.                                                           |
| `partial`   | Some cases passed, some failed. **The normal "1 of 10 failed" outcome.**     |
| `cancelled` | An `AbortSignal` fired before all cases finished.                            |
| `errored`   | The `generateItems` callback itself threw — distinct from per-case failures. |

The suite-level counters (`passedCases` / `failedCases`) and `status` are re-derived after the orchestrator finishes from the corrected per-case statuses, so an "all workflows completed cleanly but assertions caught regressions" suite reports `partial` rather than `succeeded`.

## Best practices

- **Don't `throw` from `execute` to fail a case.** Throwing skips downstream nodes — including the assertion node — so you lose all assertion data and only get a run-level error. Instead, let the workflow complete and assert on the (wrong) output. The assertion-rollup will downgrade the case to `failed`.
- **Use `score: 1`/`score: 0` for boolean checks** (equality, contains, regex match). The default `passThreshold = 0.5` does the right thing without you having to set it.
- **Use `passThreshold` for continuous metrics.** Confidence scores, judge ratings, similarity ratios — pick a threshold that reflects the bar you actually want to clear.
- **Reserve `errored: true` for assertion-code crashes.** If your judge agent fails to parse JSON, that's `errored`, not a low score — the difference shows up in dashboards as "broken evaluator" vs "regression in workflow".
- **Set `caseLabel`** on the TestTrigger so the Tests-tab tree-table is readable. Without it, rows show the opaque runId.
- **Keep TestTriggers source-controlled fixtures** (or fetched from a versioned label/folder) so suite history compares apples-to-apples over time.

## What's deferred

Phase 1 ships the foundation. Planned follow-ups:

- **Test-input snapshots** — each TestSuiteRun currently re-fetches via `generateItems` (Phase 1 inputs are _rolling-input_, hence the chart label). Phase 2 will let you snapshot fixtures on first run and reuse them deterministically — required for stable judge-score charts over time.
- **Declarative assertion shorthands** — `StringEqualsAssertion`, `JsonPathContainsAssertion`, `JudgeByAgentAssertion`. These compose on top of the generic callback `Assertion` shipping today.
- **Cancellation endpoint** — orchestrator already supports `AbortSignal`; the HTTP cancel surface is deferred until the UI exposes a button for it.
- **URL codec entry for `pane=tests`** — Tests panel state is in-memory React state today; deep-linking is a Phase 2 cleanup.
- **Coverage heatmap overlay** on the canvas itself.
- **CLI / cron / GitHub PR check integration** — currently triggered manually from the UI or HTTP only.

## Quick reference

- **Pure orchestration logic**: `packages/core/src/orchestration/TestSuiteOrchestrator.ts`
- **Built-in nodes**: `packages/core-nodes/src/nodes/{TestTriggerNode,IsTestRunNode,AssertionNode}.ts`
- **Persistence**: `packages/host/src/{domain,infrastructure,application}/runs/Test*`
- **HTTP routes**: `packages/host/src/presentation/http/routeHandlers/TestSuiteHttpRouteHandler.ts`
- **UI**: `packages/next-host/src/features/workflows/components/workflowDetail/tests/`
- **Contract types**: `packages/core/src/contracts/{assertionTypes,testTriggerTypes}.ts`, `packages/host/src/application/contracts/TestingContracts.ts`
