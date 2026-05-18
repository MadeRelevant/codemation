# Writing an Example

> **Tags are critical.** BM25 search only hits examples whose tags contain the tokens an agent queries.
> Before submitting, read [TAGGING.md](TAGGING.md) to understand what good tags look like and how to audit your own.

## File location

Examples live in one of three subdirectories under `src/examples/`:

| Directory                      | When to use                                                                      | Tag              |
| ------------------------------ | -------------------------------------------------------------------------------- | ---------------- |
| `src/examples/node/`           | One node is the star — surrounding workflow is scaffolding (`node-*.example.ts`) | `style:node`     |
| `src/examples/scenario/`       | Multi-node realistic use case — the workflow itself is the teaching unit         | `style:scenario` |
| `src/examples/custom-pattern/` | `defineRestNode` or `defineNode` templates — escape-hatch patterns               | `style:node`     |

One file = one workflow. The slug (filename without `.example.ts`) becomes the canonical example name in the catalog. Discovery and verification are recursive — all three subdirectories are scanned automatically.

## JSDoc frontmatter

Every example must open with a JSDoc block before the `export default` line.

```ts
/**
 * @description One-line summary of what this example demonstrates.
 * @tags email, trigger, automation
 * @uses @codemation/core-nodes-gmail
 * @dependencies @codemation/core-nodes-gmail@^1.0.0
 */
```

Required tags:

| Tag            | Purpose                                    |
| -------------- | ------------------------------------------ |
| `@description` | One-line summary. Shown in search results. |
| `@tags`        | Comma-separated labels. Drive BM25 search. |

Optional tags:

| Tag             | Purpose                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@uses`         | Packages, credential types, or MCP servers the example uses. Agents see this before copying the snippet. Example: `@uses @codemation/core-nodes-gmail, credential:gmail` |
| `@dependencies` | Pinned package versions. Example: `@codemation/core-nodes-gmail@^1.0.0`                                                                                                  |

## Export shape

Export the built workflow as the **default export**:

```ts
import { workflow } from "@codemation/host";

export default workflow("example.my-slug")
  .name("Human-readable name")
  .manualTrigger({
    /* seed data */
  })
  // .then(...)
  .build();
```

- `workflow("id")` — globally unique workflow id, prefixed `example.` by convention.
- `.build()` — produces the `WorkflowDefinition` the dev-host and CI gate check for.

Use `src/examples/_template.example.ts.skip` as a starting point (rename it, removing the `.skip`).

## Running locally

```bash
pnpm dev
```

Starts the Codemation dev-host pointed at `src/examples/`. Drop a new `.example.ts` file in and the watcher hot-reloads it.

## CI gates

On every PR that touches `packages/examples/**`, CI runs:

1. `pnpm --filter @codemation/examples typecheck` — TypeScript must compile.
2. `pnpm --filter @codemation/examples lint` — ESLint must pass.
3. `pnpm --filter @codemation/examples test:unit` — Loader + frontmatter tests.
4. `pnpm --filter @codemation/examples verify-examples` — Imports each file, checks workflow shape, runs the metadata extractor.

Fix any failure before the PR can merge.

## Two trigger patterns

The `workflow()` DSL only exposes `.manualTrigger()` as a starting point. For webhook, cron, or Gmail triggers use `createWorkflowBuilder` from `@codemation/core-nodes`:

```ts
// Manual trigger (simple — use for demos with stable seed data)
import { workflow } from "@codemation/host";
export default workflow("example.my-slug")
  .name("Human-readable name")
  .manualTrigger<MyJson>("Seed", [{ ... }])
  .then(...)
  .build();

// Non-manual trigger (webhook, cron, Gmail, etc.)
import { createWorkflowBuilder, WebhookTrigger } from "@codemation/core-nodes";
export default createWorkflowBuilder({ id: "example.my-slug", name: "Human-readable name" })
  .trigger(new WebhookTrigger("Incoming request", { endpointKey: "my-endpoint", methods: ["POST"] }))
  .then(...)
  .build();
```

The `createWorkflowBuilder()` chain returns `ChainCursor` which has `.then()`, `.when()`, `.route()`, and `.build()`. The `workflow()` chain returns `WorkflowChain` which additionally has `.map()`, `.if()`, `.switch()`, `.split()`, `.filter()`, `.aggregate()`, `.agent()`, and all the fluent helpers. When using `createWorkflowBuilder`, use `new If(...)`, `new Switch(...)` etc. with the raw node constructors.

## Zod version alignment

If your example imports `zod` directly and uses it with nodes from `@codemation/core-nodes`, pin to the same version that core-nodes uses (`4.3.6`). Having two zod versions causes TS type errors when passing Zod schemas to node constructors. Pin with an exact version in `package.json`:

```json
"zod": "4.3.6"
```

## Intentional omissions

This catalog deliberately excludes: examples demonstrating security bypasses, examples that require secrets committed to the repo, examples that showcase deprecated patterns, and examples with more than one workflow per file. If you are unsure whether a pattern belongs here, open a PR and ask — don't add it speculatively.

## Node-focused vs scenario examples

There are two example styles in this catalog — both are valid, both ship together.

**Node-focused** (`node-<slug>.example.ts`): one node is the star. The surrounding workflow is the minimum needed to show that node's input/output shape, configuration options, and when to reach for it. The trigger and any supporting nodes are scaffolding, not the point. Tag with `style:node`.

**Scenario** (any other slug, e.g. `gmail-summarize.example.ts`): three or more nodes collaborate to solve a realistic use case end-to-end. The workflow is the star; individual nodes are interchangeable means to an end. Tag with `style:scenario` (optional, retroactive tagging is fine).

Decision rule: if you want to teach "how do I use X?", write a node example. If you want to teach "how do I solve Y?", write a scenario example. Both go in `src/examples/`; the catalog serves both.

Node examples skip redundant coverage of nodes already starring in an existing scenario (e.g. `if-branch.example.ts` already focuses on `If`; no `node-if.example.ts` needed).

## When to write a custom-pattern example

Use a custom-pattern example when the task the agent needs to accomplish cannot be solved by any node in the built-in catalog. The agent's fallback chain is:

```
find_examples → defineRestNode → HttpRequest → defineNode
```

Three canonical references show each tier:

**`custom-rest-node-simple.example.ts`** — reach for `defineRestNode` first. It wraps a single REST endpoint as a discoverable node with automatic URL substitution, response mapping, and zero-boilerplate HTTP wiring. No credential required. This is the starting point for any "I need to call an API that isn't in the catalog" problem.

**`custom-rest-node-with-credential.example.ts`** — same shape as the simple version, but with a `credentials` map declaring a bearer-token slot. The framework resolves the credential session and injects `Authorization: Bearer <token>` automatically. Use this when the API requires authentication. Swap `bearerTokenCredentialType` for `apiKeyCredentialType` or `oauth2ClientCredentialsType` from `@codemation/core-nodes` as needed.

**`custom-node-template.example.ts`** — the escape hatch. Use `defineNode` when the task is not a REST call: arbitrary computation, data transformation, business logic, calling an SDK, or anything that doesn't map cleanly to a single HTTP request. `execute()` receives `({ input, item, itemIndex, items, ctx }, { config, credentials, execution })` — the full execution context including `ctx.collections`, `ctx.binary`, etc.

### Decision rule

| Situation                                            | Reach for                         |
| ---------------------------------------------------- | --------------------------------- |
| Need to call a REST endpoint not in the catalog      | `defineRestNode`                  |
| REST endpoint requires a bearer/API-key credential   | `defineRestNode` + `credentials`  |
| Task is not an HTTP call (computation, SDK, rules)   | `defineNode`                      |
| Need async side effects, ctx.collections, ctx.binary | `defineNode` with async `execute` |

### Export shape for custom-pattern examples

Custom-pattern example files export both the custom node (as a named export) and the workflow (as the default export):

```ts
// Named export — lets other authors import just the node definition
export const myNode = defineRestNode({ ... });

// Default export — the workflow the catalog verifies and agents copy
export default workflow("example.my-slug")
  .manualTrigger(...)
  .then(myNode.create({}, "Label", "id"))
  .build();
```

### Important: static config vs inputSchema

`defineRestNode` nodes have **no static config** — the `create({})` call always takes `{}`. Per-item values declared in `inputSchema` are read from `item.json` automatically at execution time. Ensure the items entering the node match the `inputSchema` shape.

`defineNode` nodes with an `input` block have **static config** — the fields declared in `input` are set once in the canvas and appear in the `config` arg inside `execute`. To read per-item values, use `input` (the current `item.json`) in the execute callback.

---

## What good looks like

**`if-branch.example.ts`** — the cleanest example of the binary branch pattern. It uses `createWorkflowBuilder` + raw `If` node + `.when({ true: [...], false: [...] })`. It doubles as a regression test: only `true` and `false` ports are wired; no phantom `main` port appears. Copy this when demonstrating branching.

**`llm-pipeline.example.ts`** — the reference for chained agent steps. Three `.agent()` calls in sequence, each with `CodemationChatModelConfig` (managed gateway, no credential required). Strict JSON output schemas keep the type flow explicit. Copy this when demonstrating managed-LLM multi-step pipelines.

**`switch-cases.example.ts`** — shows how to combine `Switch` with `.route()` for per-case branches and a fallback case. Uses the `workflow().manualTrigger()` pattern with multiple seed items so you can run all branches in one canvas execution. Copy this for any routing-by-value pattern.

**`node-aiagent.example.ts`** — node-focused minimal `AIAgent` usage with managed gateway, Zod `outputSchema`, and single-turn guardrails. Copy this when teaching the raw `new AIAgent({...})` constructor (as opposed to the `.agent()` fluent helper in `llm-pipeline`).

**`node-testtrigger-assertion.example.ts`** — node-focused pair: `TestTrigger` provides hardcoded fixtures, `Assertion` records pass/fail. Copy this when teaching the workflow testing primitive from scratch.
