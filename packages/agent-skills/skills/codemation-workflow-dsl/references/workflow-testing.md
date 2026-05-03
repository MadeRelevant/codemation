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
});
```

Notes:

- `triggerKind: "test"` is set automatically — `TriggerRuntimeService` skips it during live activation.
- `ctx.signal` is an `AbortSignal` raised when the suite is cancelled; long pulls should bail out.
- For hardcoded fixtures, just `yield { json: { ... } }` — no need to use credentials.

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
      name: "label is spam",
      status: item.json.label === "spam" ? "pass" : "fail",
      expected: "spam",
      actual: item.json.label,
    },
    {
      name: "confidence > 0.8",
      status: item.json.confidence > 0.8 ? "pass" : "fail",
      score: item.json.confidence,
      expected: ">0.8",
      actual: item.json.confidence,
    },
  ],
});
```

The `AssertionResult` shape (stable; persister + chart UIs key off these fields):

```ts
interface AssertionResult {
  name: string;
  status: "pass" | "fail" | "error";
  score?: number; // optional; chartable scalar (typically 0..1)
  expected?: JsonValue;
  actual?: JsonValue;
  message?: string;
  details?: Record<string, JsonValue>;
}
```

`error` is distinct from `fail`: use `fail` when the assertion didn't hold; use `error` when the assertion _itself_ threw (so dashboards separate "wrong workflow output" from "broken assertion code").

## Judge-by-Agent

A judge-by-agent is just a regular AI agent step feeding into an Assertion callback. Run an agent that returns a structured judgment, then map its output to an `AssertionResult` in the assertion callback.

## Running tests

- **From the UI**: open the workflow, click the **Tests** tab, pick a TestTrigger, click **Run tests**.
- **From code**: instantiate `TestSuiteOrchestrator` from `@codemation/core/bootstrap`, call `runSuite({ workflow, triggerNodeId })`.
- **From HTTP**: `POST /api/workflows/:workflowId/test-suite-runs` with `{ triggerNodeId, concurrency? }`.

## Suite status

| Status      | Meaning                                                             |
| ----------- | ------------------------------------------------------------------- |
| `succeeded` | All cases passed (or zero cases yielded).                           |
| `failed`    | Every case failed.                                                  |
| `partial`   | Some passed, some failed — **the normal "1 of 10 failed" outcome**. |
| `cancelled` | Suite was aborted before all cases finished.                        |
| `errored`   | The `generateItems` callback itself threw.                          |

## What's deferred (Phase 2)

- **Test-input snapshots** — Phase 1 fetches inputs live every run (rolling-input). Snapshotting will land in Phase 2 for stable judge-score charts.
- **Declarative assertion shorthands** — `StringEqualsAssertion`, `JudgeByAgentAssertion`, etc. compose on top of the generic `Assertion` shipping today.
- **CLI / cron / GitHub PR integration** — currently triggered manually via UI or HTTP only.

## Read more

- Top-level walkthrough: [`docs/workflow-testing.md`](../../../../docs/workflow-testing.md)
