# @codemation/agent-skills

## 0.1.9

### Patch Changes

- [#87](https://github.com/MadeRelevant/codemation/pull/87) [`4c50f29`](https://github.com/MadeRelevant/codemation/commit/4c50f29763ad7bc1e39723a6711ca3cf9add5014) Thanks [@cblokland90](https://github.com/cblokland90)! - Disable automatic packaged skill refreshes inside the Codemation framework monorepo so framework-author workflows stop dirtying the local worktree.
  - keep `codemation skills sync` as the explicit refresh path after upgrading `@codemation/cli` or `@codemation/agent-skills`
  - document the monorepo behavior in the packaged CLI skill and agent-skills README

## 0.1.8

### Patch Changes

- [#78](https://github.com/MadeRelevant/codemation/pull/78) [`f451b1b`](https://github.com/MadeRelevant/codemation/commit/f451b1b4657b59406e15ce5f50b243e487ff99ed) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize fluent workflow DSL callback helpers around the runtime item contract.

  `.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` now receive `(item, ctx)` so workflow authors can use `item.json` consistently and read prior completed outputs through `ctx.data` without dropping down to direct node configs.

## 0.1.7

### Patch Changes

- [#77](https://github.com/MadeRelevant/codemation/pull/77) [`525a311`](https://github.com/MadeRelevant/codemation/commit/525a311fe7868772c923f92e268730dab422cf97) Thanks [@cblokland90](https://github.com/cblokland90)! - Expose the packaged agent skills extractor as an importable module and refresh `.agents/skills/extracted` automatically when running `codemation dev`, `codemation build`, `codemation serve web`, or `codemation dev:plugin`. Add `codemation skills sync` for manual or CI refreshes after upgrading the CLI.

- [#71](https://github.com/MadeRelevant/codemation/pull/71) [`3044e73`](https://github.com/MadeRelevant/codemation/commit/3044e73fd3cfb33f8e2cbc579c10baf97ed94658) Thanks [@cblokland90](https://github.com/cblokland90)! - Add inline callable agent tools to the workflow DSL.

  This introduces `callableTool(...)` as a workflow-friendly helper for app-local agent tools, keeps
  `CallableToolFactory.callableTool(...)` as a compatible factory entry point, teaches `AIAgentNode`
  to execute callable tools with the same tracing and validation model as other tool kinds, and
  updates docs, skills, and the test-dev sample to show the new path.

- [#73](https://github.com/MadeRelevant/codemation/pull/73) [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348) Thanks [@cblokland90](https://github.com/cblokland90)! - Improve credential UX and add extensible advanced field presentation.
  - Run automatic credential health tests after create/save (including OAuth) and keep the dialog open when the test fails; auto-bind newly created credentials to empty workflow slots; auto-bind when picking an existing credential from the workflow slot dropdown while the slot is unbound.
  - Add `CredentialFieldSchema.visibility` (`default` | `advanced`) and optional `CredentialTypeDefinition.advancedSection` (advanced fields always render in a collapsible block; section labels default when omitted). Next host uses stable test ids and fixes collapsible chevron styling.
  - Credential dialog: title uses the credential type name (e.g. **Add …** / type display name on edit); hide the redundant type dropdown in edit mode.
  - Gmail OAuth: group Client ID with Client secret, move scope preset and custom scopes under an **OAuth scopes** advanced section (collapsed by default).
  - Documentation: `packages/core/docs/credential-ui-fields.md`, AGENTS.md, and credential development skill reference.

- [#74](https://github.com/MadeRelevant/codemation/pull/74) [`26ebe63`](https://github.com/MadeRelevant/codemation/commit/26ebe6346db0e9133a2133435a463c3dcd2dc537) Thanks [@cblokland90](https://github.com/cblokland90)! - Unify `workflow().agent()` message authoring with `AIAgent`.

  `WorkflowAgentOptions` now takes `messages` (the same `AgentMessageConfig` as `AIAgent`) instead of
  `prompt`. The workflow helper passes `messages` through unchanged. Docs, workflow DSL skills, and the
  test-dev sample use `itemExpr(...)` for per-item prompts; execution docs note `itemExpr` on agent
  `messages`.

## Unreleased

### Patch Changes

- Workflow DSL skill: document **`callableTool(...)`** for inline agent tools (with **`CallableToolFactory.callableTool(...)`** as the equivalent factory entry point).

## 0.1.6

### Patch Changes

- [#57](https://github.com/MadeRelevant/codemation/pull/57) [`3e882de`](https://github.com/MadeRelevant/codemation/commit/3e882de13103b6001d278b430791c380ee6771e1) Thanks [@cblokland90](https://github.com/cblokland90)! - Align discovered plugin loading with packaged JavaScript entries and keep framework watch mode rebuilding workspace plugin dist outputs.

## 0.1.5

### Patch Changes

- [#54](https://github.com/MadeRelevant/codemation/pull/54) [`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`execute(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require batch **`run`** semantics.

  Built-in nodes and workflow DSL (`split` / `filter` / `aggregate` on the fluent chain, Switch routing, execution normalization) align with the unified runnable model.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

## 0.1.4

### Patch Changes

- [#52](https://github.com/MadeRelevant/codemation/pull/52) [`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`executeOne(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require legacy batch **`Node.execute`** semantics.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

## 0.1.3

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

## 0.1.2

### Patch Changes

- [#39](https://github.com/MadeRelevant/codemation/pull/39) [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

## 0.1.1

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

## 0.1.0

### Minor Changes

- [#24](https://github.com/MadeRelevant/codemation/pull/24) [`cf5026a`](https://github.com/MadeRelevant/codemation/commit/cf5026a7c83353bb52d67a17d0b8a9ebceb91704) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a publishable Codemation agent skills package and wire the default and plugin starters to extract the shared skills after install.

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
