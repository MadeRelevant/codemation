---
name: codemation-workflow-dsl
description: Guides Codemation workflow authoring. Use when creating or updating workflow definitions in `src/workflows` — manual-trigger flows via `workflow("...").manualTrigger(...)`, or cron/webhook/other triggers via `createWorkflowBuilder({id, name}).trigger(...)`.
compatibility: Designed for Codemation apps and plugins that author workflows.
tags: workflow, dsl, authoring
uses: "@codemation/core-nodes, @codemation/host"
---

# Codemation Workflow DSL

## Mental model

A workflow definition describes how items move from a trigger through downstream node steps. Items carry data in `item.json`; earlier outputs are available through `ctx.data`. Activations are batch-shaped but most node steps execute per-item. Every workflow definition finishes with `.build()`, which validates node ids and emits a `WorkflowDefinitionError` on collision or empty id.

## When to use / when NOT

Use this skill when authoring or reviewing workflow definitions under `src/workflows/`.
Do not use for CLI-only troubleshooting or deep host architecture questions unless they directly affect workflow authoring.

## Quickstart — pick API by trigger type

```ts
// Manual trigger — full fluent sugar (.map, .if, .switch, .agent, .node, .then)
import { workflow } from "@codemation/host";
export default workflow("wf.example").manualTrigger("Start", { /* seed items */ }).map(/* ... */).build();

// Cron / webhook / any other trigger — low-level .then(new NodeConfig(...)) only
import { createWorkflowBuilder, CronTrigger } from "@codemation/core-nodes";
export default createWorkflowBuilder({ id: "wf.example", name: "Example" })
  .trigger(new CronTrigger("Daily", { schedule: "0 9 * * *", timezone: "UTC" }))
  .then(/* new SomeNodeConfig(...) */)
  .build();
```

For full patterns — multi-step pipelines, branching, SubWorkflow, binary, agent tools, TestTrigger, and complete working examples — use your harness's example-discovery tool: `find_examples({ query: "..." })`. Useful queries: `"CronTrigger"`, `"if branch"`, `"AIAgent multi-step"`, `"SubWorkflow binary"`, `"TestTrigger assertion"`.

## Decision branches & gotchas

**Two authoring APIs — pick by trigger type.** `workflow("id").manualTrigger(...)` returns a `WorkflowChain` with full fluent helpers (`.map`, `.if`, `.switch`, `.split`, `.agent`, `.node`). `createWorkflowBuilder({id, name}).trigger(new XxxTrigger(...))` returns a `ChainCursor` whose only chain method is `.then(new NodeConfig(...))`. Do NOT call `.trigger(...)` on the `workflow(...)` builder — it doesn't exist there.

**Node ids and stability.** When no explicit `id:` is given, the engine slugifies the node's `name` label (lowercase, non-alphanumeric → `-`). `"Send Email"` → `"send-email"`. Nodes sharing credential bindings use `(workflowId, nodeId, slotKey)` as the binding key — renaming a label orphans the binding. **Set explicit `id:` on every credential-using node.** `.build()` throws `WorkflowDefinitionError` on empty or duplicate ids.

**Id collision pitfall.** A manual-trigger label and a downstream agent label that share the same string both slugify to the same id — `.build()` throws. Fix: add `id: "...-agent"` to disambiguate.

**Collection nodes** use `.then(node.create(...))` instead of `.node(label, node, opts)` — TypeScript can't infer the `ParamDeep` constraint via the fluent helper. See `find_examples({ query: "collection crud" })`.

**Install state in example results.** Every `find_examples` result includes `installed: boolean` and `requiresInstall: string[]`. If `installed` is `false` or `requiresInstall` is non-empty, call `install_package` for each missing package before writing any workflow code that imports them.

**When no example matches — self-solving fallback chain.**
1. Retry with intent variations (different verb, more generic term).
2. For HTTP APIs: `find_examples({ query: "defineRestNode" })` — covers basic and credential-slotted REST.
3. For one-shot inline HTTP: `find_examples({ query: "HttpRequest" })`.
4. For non-HTTP custom logic: `find_examples({ query: "defineNode template" })`.
Do NOT ask the user to pick between primitives — they can't help; use the chain. Do NOT grep `node_modules/@codemation/*` for node implementations — examples are authoritative. Surface the technique used in your reply.

**Workflow testing.** Three built-in nodes from `@codemation/core-nodes`: `TestTrigger` (yields one item per test case), `IsTestRun` (routes `true`/`false` by `ctx.testContext`), `Assertion` (emits `AssertionResult[]`, sets `emitsAssertions: true`). See `references/workflow-testing.md` for authoring details.

**SubWorkflow binary.** `item.binary` slots pass transparently through SubWorkflow boundaries in both directions — no special config needed. Both runs share the same `BinaryStorage` singleton.

**Verify your workflow.** Call `verify_workflow({ path: "src/workflows/my-workflow.ts" })` instead of running `pnpm typecheck` yourself. Returns `{ ok, data: { typecheck, lint, build, structure }, hint? }`.

## Anti-patterns

- Do not call `.trigger(...)` on the `workflow(...)` manual builder — use `createWorkflowBuilder(...)` for non-manual triggers.
- Do not rely on slug-derived node ids for production workflows with credential bindings — always set an explicit `id:`.
- Do not improvise from memory when `find_examples` returns zero hits — use the fallback chain above.

## Read next when needed

- `references/builder-patterns.md` — item-flow rules and fluent authoring patterns.
- `references/workflow-testing.md` — TestTrigger / IsTestRun / Assertion with full examples.
- `references/complete-example.md` — dense end-to-end example covering most authoring features.
