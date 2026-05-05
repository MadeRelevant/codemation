# Workflow Testing

## Use this reference when

You are authoring or reviewing a workflow that needs **end-to-end tests**: validate agent behavior, regression-test branching, score LLM outputs over time, or assert that a workflow produces the expected output for a known set of inputs.

This is **not** for unit-testing individual nodes — use `WorkflowTestKit` from `@codemation/core/testing` for that.

## Three building blocks

1. **`TestTrigger`** — drops on the canvas alongside live triggers (Webhook / Cron / Gmail / etc.). Authored callback yields one item per test case.
2. **`IsTestRun`** — per-item router with `true` / `false` ports. Branches based on whether the run was started by the test orchestrator.
3. **`Assertion`** — generic per-item assertion node; returns one or more `AssertionResult`s per input item, one persisted `TestAssertion` row per result.

## Typical workflow shape

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
```

## Authoring a TestTrigger

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
  concurrency: 8, // optional; default 4
  caseLabel: (item) => item.json.subject, // optional; rows fall back to runId
});
```

Notes:

- `triggerKind: "test"` is set automatically — `TriggerRuntimeService` skips it during live activation.
- `ctx.signal` is an `AbortSignal` raised when the suite is cancelled; long pulls should bail out.
- For hardcoded fixtures, just `yield { json: { ... } }` — no need to use credentials.
- Set `caseLabel` so the Tests-tab tree-table shows something readable instead of opaque runIds.

## Branching in the workflow

```ts
import { IsTestRun } from "@codemation/core-nodes";

const isTestRun = new IsTestRun("Skip side effects in tests");
```

Or read `ctx.testContext` directly from a custom node:

```ts
async execute({ item, ctx }) {
  if (ctx.testContext) {
    return { json: { result: "synthetic-test-output" } };
  }
  return { json: await this.realApi.send(item.json) };
}
```

## Authoring assertions

```ts
import { Assertion } from "@codemation/core-nodes";

const checkClassification = new Assertion<{ label: string; confidence: number }>({
  name: "Classification checks",
  assertions: (item) => [
    {
      // Boolean-style: 1 = pass, 0 = fail. Default threshold (0.5) handles this.
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

The `AssertionResult` shape (stable; persister + chart UIs key off these fields):

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

Pass/fail derivation (canonical, in `@codemation/core`):

```ts
import { deriveAssertionPassed } from "@codemation/core";
// errored ? false : score >= (passThreshold ?? 0.5)
```

`errored: true` is for the assertion code itself crashing (judge agent crashed, JSON parse failed) — use it to separate "broken evaluator" from "wrong workflow output" in dashboards:

```ts
assertions: async (item, ctx) => {
  try {
    const j = await runJudge(item, ctx);
    return [{ name: "polite reply", score: j.score, passThreshold: 0.7, message: j.reason }];
  } catch (err) {
    return [{ name: "polite reply", score: 0, errored: true, message: String(err) }];
  }
};
```

## Judge-by-Agent

A judge-by-agent is just an AI agent step feeding into an Assertion callback. Run an agent that returns a structured judgment, then map its output to an `AssertionResult` (`score: 0..1`, set `passThreshold`).

## Running tests

- **From the UI**: open the workflow → **Tests** tab. Pick a TestTrigger from the dropdown (the picker lists every `triggerKind === "test"` node), click **Run tests**. Use the metric selector on the trend chart to plot pass-rate, per-assertion average scores, or case counts. Click two historical runs to compare them side-by-side.
- **From code**: instantiate `TestSuiteOrchestrator` from `@codemation/core/bootstrap`, call `runSuite({ workflow, triggerNodeId })`.
- **From HTTP**: `POST /api/workflows/:workflowId/test-suite-runs` with `{ triggerNodeId, concurrency? }`.

## Status

### Per case (`Run.testCaseStatus`)

| Status      | Meaning                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| `running`   | Workflow run dispatched, not yet finished.                                            |
| `succeeded` | Workflow completed AND every assertion passed.                                        |
| `failed`    | Assertion-rollup downgrade OR the workflow itself reported failure.                   |
| `errored`   | Workflow run threw before reaching a terminal state (engine error, not an assertion). |
| `cancelled` | Suite's `AbortSignal` fired before this case completed.                               |

### Suite

| Status      | Meaning                                                             |
| ----------- | ------------------------------------------------------------------- |
| `succeeded` | All cases passed (or zero cases yielded).                           |
| `failed`    | Every case failed.                                                  |
| `partial`   | Some passed, some failed — **the normal "1 of 10 failed" outcome**. |
| `cancelled` | Suite was aborted before all cases finished.                        |
| `errored`   | The `generateItems` callback itself threw.                          |

The suite counters and status are re-derived from the final per-case statuses, so an "all workflows completed cleanly but assertions caught regressions" suite reports `partial` rather than `succeeded`.

## Best practices

- **Don't `throw` from `execute` to fail a case.** Throwing skips downstream nodes — including the Assertion node — so you lose all assertion data and only get a run-level error. Instead, let the workflow complete and assert on the (wrong) output. The assertion-rollup downgrades the case to `failed`.
- Use `score: 1`/`score: 0` for boolean checks (equality, contains, regex). The default `passThreshold = 0.5` handles them.
- Use `passThreshold` for continuous metrics (confidence, judge ratings, similarity).
- Reserve `errored: true` for assertion-code crashes, not low scores.
- Keep TestTriggers as source-controlled fixtures so historical chart comparisons are apples-to-apples.

## What's deferred (Phase 2)

- **Test-input snapshots** — Phase 1 fetches inputs live every run (rolling-input). Snapshotting will land in Phase 2 for stable judge-score charts.
- **Declarative assertion shorthands** — `StringEqualsAssertion`, `JudgeByAgentAssertion`, etc. compose on top of the generic `Assertion` shipping today.
- **CLI / cron / GitHub PR integration** — currently triggered manually via UI or HTTP only.

## Read more

- Top-level walkthrough: [`docs/workflow-testing.md`](../../../../docs/workflow-testing.md)
