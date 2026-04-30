# @codemation/core-nodes

## 1.0.2

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

- Updated dependencies [[`ed75183`](https://github.com/MadeRelevant/codemation/commit/ed75183f51ae71b06aa2e57ae4fc48ce9db2e4ce)]:
  - @codemation/core@1.0.1

## 1.0.1

### Patch Changes

- [#95](https://github.com/MadeRelevant/codemation/pull/95) [`328c975`](https://github.com/MadeRelevant/codemation/commit/328c9759d45b711c177ea9a360ed4960ffdf5ffa) Thanks [@cblokland90](https://github.com/cblokland90)! - Workflow-canvas icon system redesign: LTR-oriented control-flow icons, pixel-perfect Split / Aggregate SVGs, and a single icon renderer shared by the canvas and the execution tree panel.

  **Why**

  The canvas reads left-to-right, but Lucide's `split`, `merge`, and `git-*` family are oriented vertically (top-to-bottom git-graph convention), so `If` and `Merge` nodes rendered 90° off from the flow direction. The execution-tree panel also ran a parallel icon-rendering path that only understood Lucide names — every time a plugin node set an icon as `builtin:<id>`, `si:<slug>`, or a URL, the tree panel silently fell back to a type-substring-guessed Lucide glyph (e.g. `"wait".includes("ai")` → the agent Bot icon). That duplication is gone.

  **What changed**
  - **Rotation suffix**: `NodeConfigBase.icon` now accepts an optional `@rot=<0|90|180|270>` tail modifier on any icon token (`lucide:`, `builtin:`, `si:`, or URL). Parsed by a strict tail regex so URLs with `@` (for example `http://user@host/icon.svg`) are unaffected, and non-orthogonal angles are rejected so glyphs stay pixel-crisp.
  - **LTR control-flow icons**:
    - `If`: `lucide:split@rot=90` — Y-fork with the single leg on the left and two arms fanning right.
    - `Merge`: `lucide:merge@rot=90` — chevron pointing right, two arms merging from the left.
  - **Pixel-perfect builtin SVGs** shipped under `packages/next-host/public/canvas-icons/builtin/`:
    - `builtin:split-rows`: 1 source square on the left, tree trunk / spine, 3 output lines on the right.
    - `builtin:aggregate-rows`: mirror — 3 input lines on the left converging through a spine into 1 summary square on the right.
    - Stroke-based SVGs (matching Lucide stroke weight next to them on the canvas).
  - **`@codemation/core-nodes` built-in node icon updates** that plug into the above: `If` (rotated split), `Merge` (rotated merge), `Split` (`builtin:split-rows`), `Aggregate` (`builtin:aggregate-rows`), `Wait` (`lucide:hourglass`), `MapData` (`lucide:square-pen`), `HttpRequest` (`lucide:globe`), `WebhookTrigger` (`lucide:webhook`), `NoOp` (`lucide:circle-dashed`).
  - **One renderer, role-only fallback**: `WorkflowExecutionInspectorTreePanelContent` now renders `<WorkflowCanvasNodeIcon />` so `builtin:`, `si:`, URLs, and `@rot=…` resolve identically in the execution tree panel and on the canvas. `WorkflowNodeIconResolver.resolveFallback` shrank from 11 branches of type-substring guessing to 4 role mappings (`agent` / `nestedAgent` → `Bot`, `languageModel` → `Brain`, `tool` → `Wrench`, else → `Boxes`). Plugin nodes that forget to set an icon now get a generic `Boxes` — a clear visual signal rather than a silent substring mismatch.
  - **New test file** `test/canvas/workflowCanvasNodeIcon.test.tsx` pins 12 behaviours across the rotation parser and the role-only fallback, including a regression case that the pre-fix `"wait".includes("ai")` mis-mapping is impossible now.

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

- Updated dependencies [[`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c), [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c)]:
  - @codemation/core@1.0.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3)]:
  - @codemation/core@0.8.1

## 0.4.2

### Patch Changes

- [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79) Thanks [@cblokland90](https://github.com/cblokland90)! - Add catalog-backed cost tracking contracts and wire AI/OCR usage into telemetry so hosts can aggregate provider-native execution costs.

  Improve the telemetry dashboard and workflow detail experience with cost breakdowns, richer inspector data, workflow run cost totals, and credential rebinding fixes.

- [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f) - Repair malformed AI tool calls inside the agent loop instead of replaying the whole agent node, and surface clearer debugging details when recovery succeeds or is exhausted.
  - classify repairable validation failures separately from non-repairable tool errors and preserve stable invocation correlation for failed calls
  - persist structured validation details and expose them in next-host inspector fallbacks, timelines, and error views
  - add regression coverage for repaired tool calls, exhaustion behavior, and mixed parallel tool rounds

- Updated dependencies [[`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868), [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79), [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e), [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f)]:
  - @codemation/core@0.8.0

## 0.4.1

### Patch Changes

- [#83](https://github.com/MadeRelevant/codemation/pull/83) [`1c74067`](https://github.com/MadeRelevant/codemation/commit/1c74067a474b54a8d6c73f55db4c3d8d3e20e2ae) Thanks [@cblokland90](https://github.com/cblokland90)! - Preserve input binaries by default for `Split` and `Aggregate`.
  - keep `binary` attachments on split fan-out items so downstream nodes do not silently lose files
  - keep `binary` attachments on aggregate output items so batch reductions preserve the originating payload

## 0.4.0

### Minor Changes

- [#81](https://github.com/MadeRelevant/codemation/pull/81) [`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4) Thanks [@cblokland90](https://github.com/cblokland90)! - Improve workflow DSL typing for helper-defined nodes.
  - allow `.node(...)` and branch `.node(...)` calls to accept helper-node params that use `itemExpr(...)`
  - preserve type safety when the current workflow item is a superset of the helper node's declared input shape
  - remove the need for common casts around empty-config helper nodes

### Patch Changes

- Updated dependencies [[`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4)]:
  - @codemation/core@0.7.0

## 0.3.0

### Minor Changes

- [#78](https://github.com/MadeRelevant/codemation/pull/78) [`f451b1b`](https://github.com/MadeRelevant/codemation/commit/f451b1b4657b59406e15ce5f50b243e487ff99ed) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize fluent workflow DSL callback helpers around the runtime item contract.

  `.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` now receive `(item, ctx)` so workflow authors can use `item.json` consistently and read prior completed outputs through `ctx.data` without dropping down to direct node configs.

## 0.2.0

### Minor Changes

- [#76](https://github.com/MadeRelevant/codemation/pull/76) [`3774fd8`](https://github.com/MadeRelevant/codemation/commit/3774fd80bc357c7eb39957f6963c692f322c38eb) Thanks [@cblokland90](https://github.com/cblokland90)! - Preserve binaries for runnable node outputs and make workflow authoring APIs accept explicit output behavior options.

  This adds `keepBinaries` support across runnable execution paths, updates `MapData` and related workflow authoring helpers to use an options object for node ids and output behavior, and refreshes tests and docs around the new contract.

- [#75](https://github.com/MadeRelevant/codemation/pull/75) [`00bc135`](https://github.com/MadeRelevant/codemation/commit/00bc1351e2dd6222d5101dbff3602a76ead33ce1) Thanks [@cblokland90](https://github.com/cblokland90)! - Add structured-output schemas to AI agents and choose the safer OpenAI response mode per model snapshot.

  This exposes `outputSchema` on agent configs, teaches `AIAgentNode` to validate and repair structured outputs, and
  avoids opting older OpenAI snapshots into `json_schema` when only function calling is safe.

- [#74](https://github.com/MadeRelevant/codemation/pull/74) [`26ebe63`](https://github.com/MadeRelevant/codemation/commit/26ebe6346db0e9133a2133435a463c3dcd2dc537) Thanks [@cblokland90](https://github.com/cblokland90)! - Unify `workflow().agent()` message authoring with `AIAgent`.

  `WorkflowAgentOptions` now takes `messages` (the same `AgentMessageConfig` as `AIAgent`) instead of
  `prompt`. The workflow helper passes `messages` through unchanged. Docs, workflow DSL skills, and the
  test-dev sample use `itemExpr(...)` for per-item prompts; execution docs note `itemExpr` on agent
  `messages`.

### Patch Changes

- [#71](https://github.com/MadeRelevant/codemation/pull/71) [`3044e73`](https://github.com/MadeRelevant/codemation/commit/3044e73fd3cfb33f8e2cbc579c10baf97ed94658) Thanks [@cblokland90](https://github.com/cblokland90)! - Add inline callable agent tools to the workflow DSL.

  This introduces `callableTool(...)` as a workflow-friendly helper for app-local agent tools, keeps
  `CallableToolFactory.callableTool(...)` as a compatible factory entry point, teaches `AIAgentNode`
  to execute callable tools with the same tracing and validation model as other tool kinds, and
  updates docs, skills, and the test-dev sample to show the new path.

- Updated dependencies [[`3044e73`](https://github.com/MadeRelevant/codemation/commit/3044e73fd3cfb33f8e2cbc579c10baf97ed94658), [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348), [`3774fd8`](https://github.com/MadeRelevant/codemation/commit/3774fd80bc357c7eb39957f6963c692f322c38eb), [`00bc135`](https://github.com/MadeRelevant/codemation/commit/00bc1351e2dd6222d5101dbff3602a76ead33ce1)]:
  - @codemation/core@0.6.0

## Unreleased

### Patch Changes

- **`AIAgentNode`**: resolve **`CallableToolConfig`** (`toolKind: "callable"`) alongside node-backed and plugin tools; validate outputs with the configured Zod schemas.

## 0.1.1

### Patch Changes

- Updated dependencies [[`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c)]:
  - @codemation/core@0.5.0

## 0.1.0

### Minor Changes

- [#54](https://github.com/MadeRelevant/codemation/pull/54) [`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`execute(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require batch **`run`** semantics.

  Built-in nodes and workflow DSL (`split` / `filter` / `aggregate` on the fluent chain, Switch routing, execution normalization) align with the unified runnable model.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

- [#56](https://github.com/MadeRelevant/codemation/pull/56) [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Add fluent workflow authoring support for port routing and core nodes.
  - `workflow()` DSL: add `route(...)`, `merge(...)`, and `switch(...)` helpers so multi-port graphs can be expressed without manual `edges`.
  - `Callback`: allow returning `emitPorts(...)` and configuring declared output ports and error handling options.
  - Next host: fix execution inspector tree nesting by preferring `snapshot.parent.nodeId` when available (nested agent/tool invocations).

### Patch Changes

- Updated dependencies [[`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7), [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb)]:
  - @codemation/core@0.4.0

## 0.0.25

### Patch Changes

- Updated dependencies [[`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e)]:
  - @codemation/core@0.3.0

## 0.0.24

### Patch Changes

- Updated dependencies [[`d3a4321`](https://github.com/MadeRelevant/codemation/commit/d3a4321dc178df51dfd61cc6eb872ccca36bbcdb)]:
  - @codemation/core@0.2.3

## 0.0.23

### Patch Changes

- [#47](https://github.com/MadeRelevant/codemation/pull/47) [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f) Thanks [@cblokland90](https://github.com/cblokland90)! - Item-node input mapping refinements, `RunQueuePlanner` multi-input merge routing, Split/Filter/Aggregate batch nodes, AIAgent `ItemNode` + optional `mapInput`/`inputSchema`, and documentation updates.

- [#47](https://github.com/MadeRelevant/codemation/pull/47) [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `TWireJson` to `RunnableNodeConfig`, typed `ItemInputMapper<TWire, TIn>` (bivariant for storage), `RunnableNodeWireJson` helper, and align `ChainCursor` / workflow DSL with upstream wire typing. Introduce `ItemInputMapperContext` so `mapInput` receives typed `ctx.data` (`RunDataSnapshot`) for reading any completed upstream node’s outputs.

- Updated dependencies [[`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f), [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f)]:
  - @codemation/core@0.2.2

## 0.0.22

### Patch Changes

- Updated dependencies [[`4989e9c`](https://github.com/MadeRelevant/codemation/commit/4989e9c7d97513c05904d47d2f85794ba716a4d3)]:
  - @codemation/core@0.2.1

## 0.0.21

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize run persistence around work items, execution instances, and run slot projections, while aligning the HTTP/UI run detail flow to run-centric naming. This also fixes AI agent tool schema serialization, nested tool item propagation, and execution inspector/canvas status handling for inline scheduler workflows.

- Updated dependencies [[`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5)]:
  - @codemation/core@0.2.0

## 0.0.20

### Patch Changes

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/core@0.1.0

## 0.0.19

### Patch Changes

- Updated dependencies [[`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0)]:
  - @codemation/core@0.0.19

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
- Updated dependencies [f0c6878]
  - @codemation/core@0.0.18
