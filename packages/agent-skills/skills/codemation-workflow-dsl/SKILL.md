---
name: codemation-workflow-dsl
description: Guides Codemation workflow authoring with the fluent Workflow DSL. Use when creating or updating `workflow("...")` definitions, triggers, `.map(...)`, `.node(...)`, branch flow, item handling, or `.build()` chains in `src/workflows`.
compatibility: Designed for Codemation apps and plugins that author workflows with the fluent DSL.
---

# Codemation Workflow DSL

## Use this skill when

Use this skill for authoring or reviewing workflow definitions built with `workflow("...")`.

Do not use this skill for CLI-only troubleshooting or deep host architecture questions unless they directly affect workflow authoring.

## Core mental model

1. A workflow definition describes how items move from a trigger through downstream steps.
2. The fluent authoring chain is the normal starting point for Codemation apps.
3. Finish fluent workflow definitions with `.build()`.
4. Activations are **batch-shaped** (`Items`); many steps use **per-item** execution (`execute`, including helper **`defineNode`**) with optional **`inputSchema`** and **`itemExpr`** on config fields. Batch reshape steps (split/filter/aggregate, **`defineBatchNode`**) work on the whole batch.
5. Fluent callback helpers follow the runtime item contract: `.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` receive `(item, ctx)`, so row fields live under `item.json` and earlier completed outputs are available through `ctx.data`.

## Authoring rules

1. Prefer the fluent `workflow(...)` chain for app-local workflow files.
2. Keep workflow files focused on orchestration and named steps.
3. Use custom nodes when a callback grows into reusable product logic.
4. Distinguish **batch activations** from **per-item node bodies**: custom nodes from **`defineNode`** implement **`execute`** per item unless you chose **`defineBatchNode`** for batch **`run`**.

## Node ids and stability

Every node in a workflow definition has an `id`. When no explicit `id:` is given, `WorkflowBuilder` derives one by slugifying the node's `name` label: lowercase, non-alphanumeric runs replaced with `-`, trimmed. `"Send Email"` becomes `"send-email"`.

`.build()` throws `WorkflowDefinitionError` if any node ends up with an empty id (blank label and no explicit `id`) or if two nodes share the same id. The check covers agent connection children (model + tools) as well.

For nodes that hold credential bindings, the binding is keyed by `(workflowId, nodeId, slotKey)`. Renaming a node's label changes its slug-derived id and orphans the binding — the operator must re-attach the credential in the UI. Prefer stable labels or set an explicit `id:` on credential-using nodes:

```ts
.node("Send notification", SendEmailNodeConfig, {
  id: "send-notification", // stable even if the label is later renamed
  // ...
})
```

## Typical flow

1. Start with `workflow("wf.example.id")`.
2. Name the workflow with `.name(...)`.
3. Add a trigger such as `.manualTrigger(...)` or `builder.trigger(new CronTrigger(...))`.
4. Add transformations or nodes in execution order.
5. End with `.build()`.

## Built-in triggers

- **`ManualTrigger`** — one-shot manual run, optionally seeded with default items. Use `.manualTrigger(name, items?)` on the fluent builder.
- **`WebhookTrigger`** — fires on an incoming HTTP request. Construct with `new WebhookTrigger(name, { endpointKey, methods })` and attach with `builder.trigger(...)`.
- **`CronTrigger`** — fires on a cron schedule. Construct with `new CronTrigger(name, { schedule, timezone? })` and attach with `builder.trigger(...)`. The expression is validated at workflow build time. Each tick emits one item: `{ firedAt: string, scheduledFor: string }` (both ISO-8601). Defaults to UTC — always supply `timezone` for DST-sensitive schedules.

## Agent tools (callable helpers)

- For **inline** agent tools in workflow files (no separate `@tool()` class), use **`callableTool(...)`** from `@codemation/core`: supply `name`, Zod `inputSchema` / `outputSchema`, and `execute({ input, item, ctx, ... })`. **`CallableToolFactory.callableTool(...)`** is the same implementation if you prefer the factory style.
- Prefer **plugin `Tool` classes** when the tool is reusable across packages; use **`AgentToolFactory.asTool(...)`** when exposing an existing runnable node to the agent.

## Workflow agent authoring

- Use `.agent(...)` for fluent workflow-defined agent steps.
- Define agent messages with `messages`, not a workflow-specific prompt shortcut.
- Use a static `messages` array for fixed prompts.
- Use `itemExpr(...)` when agent messages depend on the current item.
- Use fluent `.map((item, ctx) => ...)` when workflow data itself needs reshaping before the agent step.
- `model` may be a provider string such as `"openai:gpt-4o-mini"` or a `ChatModelConfig`.

## Workflow testing nodes

Codemation ships first-class **workflow tests**: each test case is one full workflow run, persisted with assertion records. Three nodes from `@codemation/core-nodes`:

1. **`TestTrigger`** — drop alongside live triggers. Author callback `generateItems(ctx)` returns an `AsyncIterable<Item>`; the orchestrator dispatches one workflow run per yielded item with `executionOptions.testContext` set. `triggerKind: "test"` is set automatically — live activation skips it.
2. **`IsTestRun`** — per-item router with `true` / `false` ports. Routes `true` iff `ctx.testContext` is set. Use it to skip side-effects in tests (don't actually send a real reply).
3. **`Assertion`** — generic callback emitter; returns `AssertionResult[]`. Each result is `{ name, score: 0..1, passThreshold?, errored?, expected?, actual?, message?, details? }` — pass/fail derives from `score >= (passThreshold ?? 0.5)` (use `score: 1`/`0` for boolean checks, set `passThreshold` for continuous metrics, `errored: true` for assertion-code crashes). Each result becomes one emitted item on `main` and one persisted `TestAssertion` row when running inside a test. Sets `emitsAssertions: true` so the host persister identifies it.

Authors invoke a TestSuiteRun from the canvas **Tests tab** or via `POST /api/workflows/:id/test-suite-runs`. The orchestrator caps concurrency (default 4, configurable per trigger) and aggregates results into `succeeded | failed | partial | cancelled | errored`.

Custom nodes can also read `ctx.testContext?.{testSuiteRunId, testCaseIndex}` directly — useful for synthetic outputs in test mode without `IsTestRun` branching.

## Binary slots across SubWorkflow boundaries

`item.binary` (the map of named `BinaryAttachment` records) is carried transparently through SubWorkflow boundaries in both directions:

- **Parent → child**: binary slots attached before the SubWorkflow node are visible inside the child run. `ctx.binary.openReadStream(attachment)` works in the child because both runs share the same `BinaryStorage`.
- **Child → parent**: slots attached inside the child are returned with the item and visible in the parent's continuation nodes.

This requires no special configuration in production — the shared `BinaryStorage` DI singleton is what makes cross-run byte reads possible.

### SubWorkflow + binary example

```ts
import { workflow } from "@codemation/host";
import { Callback } from "@codemation/core-nodes";
import { SubWorkflow } from "@codemation/core-nodes"; // SubWorkflowNodeConfig

export default workflow("wf.parent")
  .manualTrigger<{ url: string }>("Start", { url: "" })
  // Attach a binary slot before the sub-workflow:
  .map(async (item, ctx) => {
    const att = await ctx.binary.attach({
      name: "doc",
      body: Buffer.from("..."),
      mimeType: "application/pdf",
      filename: "doc.pdf",
    });
    return ctx.binary.withAttachment(item, "doc", att);
  })
  // Sub-workflow receives item with binary["doc"] populated:
  .then(new SubWorkflow("ParseDoc", { workflowId: "wf.child" }))
  // Continuation: both parent "doc" slot and any child-added slots are visible here.
  .map((item) => item)
  .build();
```

## Read next when needed

- Read `references/builder-patterns.md` for item-flow rules and fluent authoring patterns.
- Read `references/workflow-testing.md` for TestTrigger / IsTestRun / Assertion authoring with full examples.
