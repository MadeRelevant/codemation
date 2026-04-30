# @codemation/core

## 1.0.1

### Patch Changes

- [`ed75183`](https://github.com/MadeRelevant/codemation/commit/ed75183f51ae71b06aa2e57ae4fc48ce9db2e4ce) - Establish "per Item per Call" identity end-to-end so the workflow run inspector reports, visualizes, and dashboards multi-item AI agents correctly.

  Previously, an orchestrator agent that processed N items emitted one flat list of LLM rounds and tool calls — the bottom execution tree, the right-panel agent timeline, cost dashboards, and the realtime event stream all collapsed iterations into one bucket, making sub-agent fan-outs (and parallel item processing in general) unreadable.

  **What changed**
  - **Engine** (`@codemation/core`): `NodeExecutor` mints a `NodeIterationId` per item inside per-item runnable activations and stamps it (with `itemIndex`) onto `NodeExecutionContext`. Connection invocations, telemetry spans (`gen_ai.chat.completion`, `agent.tool.call`), metric points (`codemation.cost.estimated`, `codemation.agent.turns`, `codemation.agent.tool_calls`), and run events all carry the per-item identity. New `ChildExecutionScopeFactory` re-roots `NodeExecutionContext` for sub-agents so credentials and iteration ids resolve correctly across the orchestrator → tool → sub-agent boundary.
  - **Sub-agent credentials** (`@codemation/core-nodes`): `NodeBackedToolRuntime.resolveNodeCtx` no longer re-wraps `args.ctx.nodeId` with `ConnectionNodeIdFactory.toolConnectionNodeId` — the caller already pre-wraps it. The previous double-nesting produced exponentially deep node ids (`AIAgentNode:2__conn__tool__conn__searchInMail__conn__tool__conn__searchInMail__conn__llm`) that didn't match user-bound credential slots. Sub-agent OpenAI / API-key slots resolve again.
  - **Realtime events**: new `connectionInvocationStarted` / `connectionInvocationCompleted` / `connectionInvocationFailed` events carry the full `ConnectionInvocationRecord` (incl. `iterationId`, `itemIndex`, `parentInvocationId`) and surgical reducers update the run cache without waiting for a coarse `runSaved` snapshot. Run-query polling dropped from 250 ms → 5 s now that WebSocket events drive most updates.
  - **Persistence** (`@codemation/host`): Prisma `ExecutionInstance` model gains `iteration_id`, `item_index`, `parent_invocation_id` columns + index (sqlite + postgres migrations); `PrismaWorkflowRunRepository` round-trips them on read/save and via `ExecutionInstanceDto`. Without this the cold reload of a finished run silently flattens the per-item tree because `runSaved` events stream through Prisma. Telemetry tables already carried these columns from Phase 4; both sides now agree.
  - **Iteration projection / cost queries** (`@codemation/host`): new `RunIterationProjectionFactory` projects `RunIterationRecord`s from connection invocations + iteration cost metrics and `GetIterationCostQueryHandler` serves per-iteration cost rollups for dashboards.
  - **Inspector view model** (`@codemation/next-host`): `NodeInspectorTelemetryPresenter` groups LLM and tool spans by `iterationId` into "Item N" accordion entries (single-item agents fall back to flat layout). New `FocusedInvocationModelFactory` powers item-level prev/next navigation when a specific invocation is selected — the breadcrumb shows "Item X of Y" and nav targets the first invocation of adjacent items. Tool spans now interleave chronologically with LLM rounds (request → tools → response) instead of LLM rounds first then orphan tools at the bottom.
  - **Bottom execution tree** (`@codemation/next-host`): new `ExecutionTreeItemGroupInjector` injects synthetic "Item N" parent rows between an agent and its connection invocations when the agent processed 2+ items. Single-item activations are left untouched; sub-agent invocations whose `parentInvocationId` already points at a tool-call row stay nested under the orchestrator's specific tool call.
  - **Sub-agent credential boundary**: `ChildExecutionScopeFactory.forSubAgent` ensures sub-agent `NodeExecutionContext` keeps the parent invocation id and span context intact so trace nesting and credential resolution agree on the connection-node id.
  - **Tests**: new unit + UI suites for each layer (sub-agent scope, item-group injector, focused invocation model, agent timeline per-item grouping, chronological ordering, Prisma iterationId round trip, item-aware properties panel, connection-invocation event publisher) and a runnable `apps/test-dev` sample (`agentSubAgentToolFanout`) that exercises the orchestrator → sub-agent fan-out across 2 items end-to-end.

## 1.0.0

### Major Changes

- [#93](https://github.com/MadeRelevant/codemation/pull/93) [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace LangChain with the Vercel AI SDK for all AIAgent flows.

  Codemation no longer depends on `@langchain/core` or `@langchain/openai`. Chat model providers, the turn loop, structured output, and tool calls now run on top of the Vercel **AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/provider`). Custom Codemation behaviors that LangChain did not cover — the **tool-args repair loop**, the **structured-output repair loop**, **connection-invocation tracking**, and our **telemetry / cost-tracking spans** — are preserved and built on top of the new primitives.

  ### Dependency changes
  - **Removed**: `@langchain/core`, `@langchain/openai` (from `@codemation/core-nodes`).
  - **Added**: `ai` `^6.0.168`, `@ai-sdk/openai` `^3.0.53`, `@ai-sdk/provider` `^3.0.8` (to `@codemation/core-nodes`). `@codemation/host` picks up `ai` + `@ai-sdk/provider` for its test harness only.

  ### Public API renames (`@codemation/core`)

  | Before                                               | After                                                                                                             |
  | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
  | `LangChainChatModelLike`                             | `ChatLanguageModel`                                                                                               |
  | `LangChainStructuredOutputModelLike`                 | _(removed — replaced by `StructuredOutputOptions` + `generateText({ experimental_output: Output.object(...) })`)_ |
  | `ChatModelFactory.create` → `LangChainChatModelLike` | `ChatModelFactory.create` → `ChatLanguageModel` (thin wrapper around an AI SDK `LanguageModelV2`)                 |

  `ChatLanguageModel` exposes the underlying AI SDK `LanguageModel` via `languageModel` plus `modelName`, `provider`, and optional `defaultCallOptions` (`maxOutputTokens`, `temperature`, `providerOptions`). `StructuredOutputOptions` mirrors `generateText({ output: Output.object(...) })` and carries an optional `schemaName` plus `strict` flag.

  ### Custom behavior preserved (not delegated to the AI SDK)
  - **Tool dispatch + tool-args repair**: tools are passed to `generateText` **without `execute`** so tool calls surface back to Codemation; `AgentToolExecutionCoordinator` still drives parallel execution, per-tool Zod-input validation, repair prompts, and retry accounting via `repairAttemptsByToolName`.
  - **Structured output repair**: `AgentStructuredOutputRunner` still runs the `OpenAiStrictJsonSchemaFactory` + `AgentStructuredOutputRepairPromptFactory` loop; AI SDK's `Output.object(...)` is used only for the **first** structured attempt when the provider supports it.
  - **Connection-invocation tracking**: `ConnectionInvocationIdFactory` + synthetic `LanguageModelConnectionNode` / tool connection node states (`queued` / `running` / `completed` / `failed`) are still emitted per turn and per tool call.
  - **Telemetry span names (intentional, short-term)**: LLM calls stay on `gen_ai.chat.completion`, tool calls on `agent.tool.call`, metrics on `codemation.ai.turns` / `codemation.ai.tool_calls` / `codemation.cost.estimated`. We disable AI SDK's built-in telemetry (`experimental_telemetry`) for this cut so host-side telemetry aggregations keep working unchanged. Migrating to AI SDK native span names is intentionally deferred.
  - **Engine-level retry control**: every `generateText` call uses `maxRetries: 0` so Codemation's own retry / repair policy is the single source of truth.

  ### New test utilities

  Tests that previously scripted `LangChainChatModelLike` now script AI SDK `LanguageModelV3` via `MockLanguageModelV3` from `ai/test`. `@codemation/core-nodes` and `@codemation/host` test files ship small adapters (`ScriptedResponseConverter`, `ScriptedDoGenerateFactory`, `TelemetryResponseConverter`) that translate Codemation's legacy `{ content, tool_calls, usage_metadata }` fixtures into `LanguageModelV3GenerateResult`.

  ### Migration notes for consumers
  - If you implemented a **custom `ChatModelFactory`**, return a `ChatLanguageModel` (wrap an AI SDK `LanguageModelV2`) instead of a LangChain-shaped chat model. The `name` / `modelName` / `provider` on your config still drive cost tracking.
  - If you imported the type `LangChainChatModelLike` (or `LangChainStructuredOutputModelLike`) from `@codemation/core`, switch to `ChatLanguageModel` (and drop structured-output-method imports — `generateText({ experimental_output })` covers it).
  - `OpenAIChatModelFactory` now builds an AI SDK OpenAI provider under the hood; behavior for end users (model presets, credential resolution, token accounting, structured output against strict mode) is unchanged.
  - Telemetry dashboards, trace views, and cost-tracking queries continue to work against the existing Codemation span / metric names.

### Patch Changes

- [#93](https://github.com/MadeRelevant/codemation/pull/93) [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix `Unique constraint failed on the fields: (instance_id)` crash when rerunning a workflow that contains an AI agent.

  Reproduction: build `Manual trigger → AI agent → node → node`, click play on the agent, then click play on the next node (sometimes twice). The second run would fail at `PrismaWorkflowRunRepository.saveOnce` with a Postgres PK violation on the `ExecutionInstance` table.

  Root cause: `RunStartService.createRunCurrentState` was deep-copying the prior run's `connectionInvocations` verbatim into the new run's initial state. Each record kept its original globally-unique `invocationId`, which is the primary key in `ExecutionInstance`. `saveOnce`'s existing-row lookup is scoped to the current `runId`, so the collision against the prior run's rows was only detected by Postgres when the insert fired.

  Beyond the crash, the old behavior was also a data-model lie for compliance / OTEL: a `ConnectionInvocationRecord` represents a single auditable LLM / tool call and must belong to exactly one run. Copying it into another run made the same event appear to have happened twice.

  Fix (domain + defense-in-depth):
  - `@codemation/core` — `RunStartService.createRunCurrentState` now starts new runs with an empty invocation ledger. The prior run's invocations remain queryable on that run's persisted state (their true owner).
  - `@codemation/host` — `PrismaWorkflowRunRepository.buildExecutionInstances` skips any invocation whose `runId` differs from the run being saved, so a stray carry-over from any other code path self-heals instead of crashing the save.

  UI impact: none for the historical-run view (it reads invocations directly from the selected run). The client-side debugger overlay continues to surface the prior run's invocations locally during a rerun, and inspector telemetry already fetches against each invocation's original `runId`.

## 0.8.1

### Patch Changes

- [`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3) Thanks [@cblokland90](https://github.com/cblokland90)! - Default DI container registrations to singletons so framework services that own long-lived resources (timers, subscriptions, sockets) have deterministic lifecycles. Previously `container.register(Class, { useClass: Class })` produced a new instance per resolution, which caused the `WorkflowRunRetentionPruneScheduler` `setInterval` timer to leak across HMR reloads and blocked `pnpm dev` from shutting down on Ctrl+C.

  Public registration DTOs still accept `useClass` as a shape hint, but the host applies every class-based registration as a singleton. Plugin authors using `plugin.register({ registerNode, registerClass })` and consumers using `containerRegistrations: [{ token, useClass }]` no longer need to reason about lifecycle. Redundant `@registry([{ useClass }])` decorators on Hono route registrars and domain event handlers have been removed.

  A new ESLint rule (`codemation/no-transient-container-register`) prevents reintroducing `.register(token, { useClass: Class })` and `@registry([{ useClass: Class }])` patterns across `packages/**` and `apps/**`.

## 0.8.0

### Minor Changes

- [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79) Thanks [@cblokland90](https://github.com/cblokland90)! - Add catalog-backed cost tracking contracts and wire AI/OCR usage into telemetry so hosts can aggregate provider-native execution costs.

  Improve the telemetry dashboard and workflow detail experience with cost breakdowns, richer inspector data, workflow run cost totals, and credential rebinding fixes.

### Patch Changes

- [#85](https://github.com/MadeRelevant/codemation/pull/85) [`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868) Thanks [@cblokland90](https://github.com/cblokland90)! - Decouple telemetry retention from run deletion and move node-specific measurements onto metric points.
  - allow telemetry spans, artifacts, and metrics to outlive raw run state through explicit retention timestamps
  - narrow telemetry spans to canonical span fields and persist extensible node-specific measurements as metric points
  - update telemetry queries, docs, and regression coverage around real workflow execution plus agent/tool observability

- [#88](https://github.com/MadeRelevant/codemation/pull/88) [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a telemetry-backed node inspector slice for workflow detail and expose run-trace telemetry needed to power it.

- [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f) - Repair malformed AI tool calls inside the agent loop instead of replaying the whole agent node, and surface clearer debugging details when recovery succeeds or is exhausted.
  - classify repairable validation failures separately from non-repairable tool errors and preserve stable invocation correlation for failed calls
  - persist structured validation details and expose them in next-host inspector fallbacks, timelines, and error views
  - add regression coverage for repaired tool calls, exhaustion behavior, and mixed parallel tool rounds

## 0.7.0

### Minor Changes

- [#81](https://github.com/MadeRelevant/codemation/pull/81) [`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4) Thanks [@cblokland90](https://github.com/cblokland90)! - Add typed workflow authoring helpers for reusable node params and run-data reads.
  - export `Expr`, `Param`, and `ParamDeep` so helper-defined node params can accept literals or `itemExpr(...)`
  - export `nodeRef<TJson>()` plus generic `RunDataSnapshot` item accessors for typed `ctx.data` reads
  - keep helper-node runtime config resolved while expanding the public authoring surface for expression-style params

## 0.6.0

### Minor Changes

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

- [#76](https://github.com/MadeRelevant/codemation/pull/76) [`3774fd8`](https://github.com/MadeRelevant/codemation/commit/3774fd80bc357c7eb39957f6963c692f322c38eb) Thanks [@cblokland90](https://github.com/cblokland90)! - Preserve binaries for runnable node outputs and make workflow authoring APIs accept explicit output behavior options.

  This adds `keepBinaries` support across runnable execution paths, updates `MapData` and related workflow authoring helpers to use an options object for node ids and output behavior, and refreshes tests and docs around the new contract.

- [#75](https://github.com/MadeRelevant/codemation/pull/75) [`00bc135`](https://github.com/MadeRelevant/codemation/commit/00bc1351e2dd6222d5101dbff3602a76ead33ce1) Thanks [@cblokland90](https://github.com/cblokland90)! - Add structured-output schemas to AI agents and choose the safer OpenAI response mode per model snapshot.

  This exposes `outputSchema` on agent configs, teaches `AIAgentNode` to validate and repair structured outputs, and
  avoids opting older OpenAI snapshots into `json_schema` when only function calling is safe.

## Unreleased

### Minor Changes

- Add **`callableTool(...)`** (exported from authoring; same behavior as **`CallableToolFactory.callableTool(...)`**), **`CallableToolConfig`**, and **`CallableToolKindToken`** for inline Zod-typed agent tools (optional **`credentialRequirements`**, structural **`toolKind: "callable"`** for snapshots). Same runtime contract as other agent tools; no implicit merge of workflow **`item.json`** into tool input.

## 0.5.0

### Minor Changes

- [#60](https://github.com/MadeRelevant/codemation/pull/60) [`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c) Thanks [@cblokland90](https://github.com/cblokland90)! - Harden the Gmail plugin so it imports reliably from the package root, returns an authenticated official Gmail session, and supports trigger/read/send/reply/label workflows with one OAuth credential.

  Add framework support for OAuth scope presets and custom per-credential scope replacement, and update the plugin starter/docs so future plugins scaffold the same publishable root-entrypoint conventions.

## 0.4.0

### Minor Changes

- [#54](https://github.com/MadeRelevant/codemation/pull/54) [`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`execute(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require batch **`run`** semantics.

  Built-in nodes and workflow DSL (`split` / `filter` / `aggregate` on the fluent chain, Switch routing, execution normalization) align with the unified runnable model.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

- [#56](https://github.com/MadeRelevant/codemation/pull/56) [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Add fluent workflow authoring support for port routing and core nodes.
  - `workflow()` DSL: add `route(...)`, `merge(...)`, and `switch(...)` helpers so multi-port graphs can be expressed without manual `edges`.
  - `Callback`: allow returning `emitPorts(...)` and configuring declared output ports and error handling options.
  - Next host: fix execution inspector tree nesting by preferring `snapshot.parent.nodeId` when available (nested agent/tool invocations).

## 0.3.0

### Minor Changes

- [#52](https://github.com/MadeRelevant/codemation/pull/52) [`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`executeOne(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require legacy batch **`Node.execute`** semantics.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

## 0.2.3

### Patch Changes

- [#50](https://github.com/MadeRelevant/codemation/pull/50) [`d3a4321`](https://github.com/MadeRelevant/codemation/commit/d3a4321dc178df51dfd61cc6eb872ccca36bbcdb) Thanks [@cblokland90](https://github.com/cblokland90)! - Release automation: GitHub Actions now dispatches `publish-npm.yml` after versioning so npm OIDC trusted publishing continues to match the publish workflow file (no `workflow_call` from the Changesets workflow).

## 0.2.2

### Patch Changes

- [#47](https://github.com/MadeRelevant/codemation/pull/47) [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f) Thanks [@cblokland90](https://github.com/cblokland90)! - Item-node input mapping refinements, `RunQueuePlanner` multi-input merge routing, Split/Filter/Aggregate batch nodes, AIAgent `ItemNode` + optional `mapInput`/`inputSchema`, and documentation updates.

- [#47](https://github.com/MadeRelevant/codemation/pull/47) [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `TWireJson` to `RunnableNodeConfig`, typed `ItemInputMapper<TWire, TIn>` (bivariant for storage), `RunnableNodeWireJson` helper, and align `ChainCursor` / workflow DSL with upstream wire typing. Introduce `ItemInputMapperContext` so `mapInput` receives typed `ctx.data` (`RunDataSnapshot`) for reading any completed upstream node’s outputs.

## 0.2.1

### Patch Changes

- [#44](https://github.com/MadeRelevant/codemation/pull/44) [`4989e9c`](https://github.com/MadeRelevant/codemation/commit/4989e9c7d97513c05904d47d2f85794ba716a4d3) Thanks [@cblokland90](https://github.com/cblokland90)! - Add optional `icon` to `defineNode(...)` so plugin nodes can set `NodeConfigBase.icon` for the workflow canvas (Lucide, `builtin:`, `si:`, or image URLs).

## 0.2.0

### Minor Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize run persistence around work items, execution instances, and run slot projections, while aligning the HTTP/UI run detail flow to run-centric naming. This also fixes AI agent tool schema serialization, nested tool item propagation, and execution inspector/canvas status handling for inline scheduler workflows.

## 0.1.0

### Minor Changes

- [#39](https://github.com/MadeRelevant/codemation/pull/39) [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

## 0.0.19

### Patch Changes

- [#26](https://github.com/MadeRelevant/codemation/pull/26) [`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual trigger reruns and current-state resume behavior.

  Current-state execution now treats empty upstream outputs like the live queue planner, so untaken branches stay dead on resume. Manual downstream runs can also synthesize trigger test items through core intent handling instead of relying on host-specific trigger logic.

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
