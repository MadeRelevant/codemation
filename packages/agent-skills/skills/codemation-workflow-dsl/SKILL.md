---
name: codemation-workflow-dsl
description: Guides Codemation workflow authoring. Use when creating or updating workflow definitions in `src/workflows` — manual-trigger flows via `workflow("...").manualTrigger(...)`, or cron/webhook/other triggers via `createWorkflowBuilder({id, name}).trigger(...)`.
compatibility: Designed for Codemation apps and plugins that author workflows.
---

# Codemation Workflow DSL

## Use this skill when

Authoring or reviewing workflow definitions under `src/workflows/`.

Do not use this skill for CLI-only troubleshooting or deep host architecture questions unless they directly affect workflow authoring.

## Discovering nodes and patterns

**Always call `find_examples` first** when you need to learn how to use a node or build a workflow pattern.

### Why examples are the canonical reference

Examples in the catalog typecheck, lint, and are verified by CI. They show the exact import paths, constructor signatures, and DSL shape that work in a real project — more efficiently than reading schema definitions or grepping framework source.

### When to call `find_examples` first

- Before writing any workflow that uses an unfamiliar node.
- When you need a pattern (polling, branching, sub-workflow, agent with tools, etc.) and aren't sure of the exact API.
- As your first step — before `read_skill`, before `search_capabilities`, before reading any file.

### Query patterns

Call `find_examples` in two ways:

```ts
// By node name:
find_examples({ query: "HttpRequest" });
find_examples({ query: "AIAgent" });
find_examples({ query: "CronTrigger" });

// By use case / intent:
find_examples({ query: "poll API and write to database" });
find_examples({ query: "AIAgent multi-step pipeline" });
find_examples({ query: "gmail trigger classify email" });
```

Mix both: `find_examples({ query: "AIAgent gmail classify" })` works too.

### Install state in results

Every search result includes `installed: boolean` and `requiresInstall: string[]`. Use these to plan installs (`install_package`) before adapting an example. If `installed` is `false` or `requiresInstall` is non-empty, call `install_package` for each missing package before writing any workflow code that imports them.

### When find_examples returns zero hits

Stop. Do not improvise from memory. Do one of:

1. **Ask the user**: "I don't have an example for `<query>`. Would you like me to adapt the closest match (`<nearest>`) or should a proper example be added first?"
2. **Adapt the closest near-miss** — only with the user's explicit confirmation that the approach is reasonable.

Do not attempt to infer node behavior by grepping framework source code (e.g. `node_modules/@codemation/*`). Examples convey the same information more efficiently and are authoritative.

## When no example matches — the self-solving fallback chain

If `find_examples` returns no good match for your query, **do not ask the user**. The user is non-technical and can't help you pick between framework primitives. Solve it using this fixed chain:

### Tier 1 — Retry with intent variations

Re-query with the underlying intent: a different verb, a more generic term, the closest standard pattern. Example: no hit for `"google sheets append row"` → retry `"http POST bearer credential"` or `"REST API call with credential"`.

### Tier 2 — Custom REST node (preferred for HTTP APIs)

If the task is "call an external HTTP API," use `defineRestNode`. Always works.

`find_examples({ query: "defineRestNode" })` → returns the canonical templates:

- `custom-rest-node-simple.example.ts` — basic shape
- `custom-rest-node-with-credential.example.ts` — with bearer/OAuth credential slot

Adapt these to the specific endpoint + payload shape needed.

### Tier 3 — Raw HttpRequest (inline, one-off)

If the call is one-shot inline in a workflow and you don't need to define a reusable node, use the `HttpRequest` config class.

`find_examples({ query: "HttpRequest" })` → `node-httprequest.example.ts`

### Tier 4 — defineNode (non-HTTP custom logic)

If the task isn't an HTTP call (data transformation, business logic, anything stateful), use `defineNode`.

`find_examples({ query: "defineNode template" })` → `custom-node-template.example.ts`

### What NOT to do

- Do NOT ask the user "should I use HttpRequest or defineRestNode?" — they can't help; pick using the chain.
- Do NOT grep `node_modules/@codemation/*` for node implementations — the templates above are the canonical reference.
- Do NOT invent a custom solution outside this chain.

### Surfacing what you did

After building, your final message to the concierge should state the technique used, e.g.:

> "Built using `defineRestNode` for the Google Sheets append call (no first-class Sheets node yet)."

This is informational, not a request for approval.

## There are TWO authoring APIs — pick by trigger type

| Trigger                                                     | API to use                                                         | Import                                                                                        | Available chain helpers                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Manual** (one-shot, optionally seeded with default items) | `workflow("id").manualTrigger(...)`                                | `import { workflow } from "@codemation/host"`                                                 | Full fluent sugar: `.map`, `.if`, `.switch`, `.split`, `.agent`, `.node`, `.then`, `.build`  |
| **Cron, Webhook, Test, or any non-manual trigger**          | `createWorkflowBuilder({ id, name }).trigger(new XxxTrigger(...))` | `import { createWorkflowBuilder, CronTrigger, WebhookTrigger } from "@codemation/core-nodes"` | Low-level `.then(new SomeNodeConfig(...))` only — **no** `.map`/`.if`/`.agent`/`.node` sugar |

**Why two APIs?** `workflow("...")` returns a `WorkflowAuthoringBuilder` that _only_ exposes `.name()` and `.manualTrigger(...)`. Once you call `.manualTrigger(...)`, you get a `WorkflowChain` that has all the fluent helpers. For any other trigger, you must use the lower-level `createWorkflowBuilder({id, name}).trigger(new Trigger(...))` path — the result is a `ChainCursor` whose only chain method is `.then(new NodeConfig(...))`. You compose by passing node config classes directly: `new Callback(...)`, `new HttpRequest(...)`, `new AIAgent(...)`, `new If(...)`, `new Split(...)`, etc.

If you find yourself wanting `.map` or `.if` on a cron workflow, you have two options: (a) accept the verbose `.then(new Callback(...))` style, or (b) wrap the cron-trigger cursor explicitly: `new WorkflowChain(builder.trigger(new CronTrigger(...)))` — but this is rare in practice; production cron workflows use plain `.then(new ConfigClass(...))`.

## Core mental model

1. A workflow definition describes how items move from a trigger through downstream steps.
2. Activations are **batch-shaped** (`Items`); many steps use **per-item** execution (`execute`, including helper **`defineNode`**) with optional **`inputSchema`** and **`itemExpr`** on config fields. Batch reshape steps (split/filter/aggregate, **`defineBatchNode`**) work on the whole batch.
3. Fluent callback helpers (manual-trigger only) follow the runtime item contract: `.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` receive `(item, ctx)`. Row fields live under `item.json`; earlier completed outputs are available through `ctx.data`.
4. Finish every workflow definition with `.build()`.

## Authoring rules

1. **Pick the API by trigger type** (see table above). Don't try to call `.trigger(...)` on the `workflow(...)` builder — it doesn't exist there.
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

### Collision gotcha — set explicit ids on every node

Auto-derived ids can also **collide** when a trigger and a downstream node share a label. Example:

```ts
// ❌ Auto-derived ids collide: both slugify to "classify-feedback"
workflow("wf.feedback")
  .manualTrigger("Classify feedback", {
    /* ... */
  })
  .agent("Classify feedback", {
    /* ... */
  })
  .build(); // throws WorkflowDefinitionError: duplicate nodeId "classify-feedback"

// ✅ Explicit id on the AIAgent disambiguates
workflow("wf.feedback")
  .manualTrigger("Classify feedback", {
    /* ... */
  })
  .agent("Classify feedback", { id: "classify-feedback-agent" /* ... */ })
  .build();
```

**Recommendation: always set an explicit `id:` on every node.** It's a few extra characters that buys you:

1. Stable credential bindings across label renames (above)
2. No collision build errors when refactoring labels
3. Stable references for any downstream code that addresses nodes by id (e.g. pinned-output state, test-suite assertions, audit-log entries)

The slug-derived default exists for quick prototyping; production workflows should declare ids.

## Typical flow

**Manual trigger (fluent):**

1. `workflow("wf.example.id")`.
2. `.name("Display name")` (optional — defaults to the id).
3. `.manualTrigger("Start", { /* default item json */ })`.
4. Chain transformations: `.map(...)`, `.if(...)`, `.switch(...)`, `.split(...)`, `.agent(...)`, `.node(...)`, `.then(...)`.
5. `.build()`.

**Cron / webhook (low-level):**

1. `createWorkflowBuilder({ id: "wf.example.id", name: "Display name" })`.
2. `.trigger(new CronTrigger("Label", { schedule, timezone }))` or `.trigger(new WebhookTrigger("Label", { endpointKey, methods }))`.
3. Chain with `.then(new SomeNodeConfig(...))` repeatedly. Common configs: `Callback`, `HttpRequest`, `AIAgent`, `If`, `Split`, `Merge`, `SubWorkflow`.
4. `.build()`.

## Built-in triggers

- **`ManualTrigger`** — one-shot manual run, optionally seeded with default items. Use the fluent shortcut: `workflow("id").manualTrigger(name, items?)`. The shortcut internally wires up `createWorkflowBuilder(...).trigger(new ManualTrigger(...))` and wraps the result in `WorkflowChain` so you get the full fluent sugar.
- **`WebhookTrigger`** — fires on an incoming HTTP request. Construct with `new WebhookTrigger(name, { endpointKey, methods })`. Attach via `createWorkflowBuilder({id, name}).trigger(new WebhookTrigger(...))`.
- **`CronTrigger`** — fires on a cron schedule. Construct with `new CronTrigger(name, { schedule, timezone? })`. Attach via `createWorkflowBuilder({id, name}).trigger(new CronTrigger(...))`. The expression is validated at workflow build time. Each tick emits one item: `{ firedAt: string, scheduledFor: string }` (both ISO-8601). Defaults to UTC — always supply `timezone` for DST-sensitive schedules.

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

### SubWorkflow + binary example (manual trigger)

```ts
import { workflow } from "@codemation/host";
import { Callback, SubWorkflow } from "@codemation/core-nodes";

// Manual-trigger flow — uses the fluent `.map`/`.then` sugar.
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
- Read `references/complete-example.md` for a single dense end-to-end workflow example that exercises most authoring features (CronTrigger, map, if, agent, callableTool, itemExpr, ctx.data, ctx.binary, node with explicit id, build).

## Verifying your workflow

After writing or modifying a workflow file, call `verify_workflow({ path })` instead of running `pnpm typecheck` yourself. The tool runs typecheck + lint + DSL build + structure dump in one round-trip and returns a structured envelope:

```ts
verify_workflow({ path: "src/workflows/my-workflow.ts" });
// → { ok: true, data: { typecheck: "ok", lint: "ok", build: "ok", structure: { id, name, trigger, nodes, edges, activation } } }
// → { ok: false, error: "...", data: { typecheck: {...}, lint: {...}, build: {...}, structure: null }, hint: "..." }
```

A failed `ok: false` result includes a `hint` field that points at the specific fix needed. Fix the reported errors and call `verify_workflow` again — do not report done until `ok: true`.
