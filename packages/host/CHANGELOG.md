# @codemation/host

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

- Updated dependencies [[`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c), [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c)]:
  - @codemation/core-nodes@1.0.0
  - @codemation/core@1.0.0
  - @codemation/eventbus-redis@0.0.32

## 0.3.1

### Patch Changes

- [`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3) Thanks [@cblokland90](https://github.com/cblokland90)! - Default DI container registrations to singletons so framework services that own long-lived resources (timers, subscriptions, sockets) have deterministic lifecycles. Previously `container.register(Class, { useClass: Class })` produced a new instance per resolution, which caused the `WorkflowRunRetentionPruneScheduler` `setInterval` timer to leak across HMR reloads and blocked `pnpm dev` from shutting down on Ctrl+C.

  Public registration DTOs still accept `useClass` as a shape hint, but the host applies every class-based registration as a singleton. Plugin authors using `plugin.register({ registerNode, registerClass })` and consumers using `containerRegistrations: [{ token, useClass }]` no longer need to reason about lifecycle. Redundant `@registry([{ useClass }])` decorators on Hono route registrars and domain event handlers have been removed.

  A new ESLint rule (`codemation/no-transient-container-register`) prevents reintroducing `.register(token, { useClass: Class })` and `@registry([{ useClass: Class }])` patterns across `packages/**` and `apps/**`.

- Updated dependencies [[`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3)]:
  - @codemation/core@0.8.1
  - @codemation/core-nodes@0.4.3
  - @codemation/eventbus-redis@0.0.31

## 0.3.0

### Minor Changes

- [#85](https://github.com/MadeRelevant/codemation/pull/85) [`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868) Thanks [@cblokland90](https://github.com/cblokland90)! - Decouple telemetry retention from run deletion and move node-specific measurements onto metric points.
  - allow telemetry spans, artifacts, and metrics to outlive raw run state through explicit retention timestamps
  - narrow telemetry spans to canonical span fields and persist extensible node-specific measurements as metric points
  - update telemetry queries, docs, and regression coverage around real workflow execution plus agent/tool observability

- [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79) Thanks [@cblokland90](https://github.com/cblokland90)! - Add catalog-backed cost tracking contracts and wire AI/OCR usage into telemetry so hosts can aggregate provider-native execution costs.

  Improve the telemetry dashboard and workflow detail experience with cost breakdowns, richer inspector data, workflow run cost totals, and credential rebinding fixes.

- [#87](https://github.com/MadeRelevant/codemation/pull/87) [`4c50f29`](https://github.com/MadeRelevant/codemation/commit/4c50f29763ad7bc1e39723a6711ca3cf9add5014) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a telemetry dashboard API and replace the placeholder dashboard with filterable workflow and AI metrics.
  - expose summary, timeseries, and model-dimension telemetry queries for dashboard clients
  - add a next-host dashboard with time, workflow, folder, status, and model filters plus run/token charts

- [`5d649ee`](https://github.com/MadeRelevant/codemation/commit/5d649ee878f417ad18159584941af6de0a55c0a7) - Expand the telemetry dashboard so operators can filter, persist, and inspect workflow runs more effectively.
  - add run-origin filters, paginated run results, and richer telemetry query support on the host API
  - redesign the next-host dashboard with grouped metrics, sticky filters, nested workflow selection, persisted filters, and clearer multi-select controls

### Patch Changes

- [#88](https://github.com/MadeRelevant/codemation/pull/88) [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a telemetry-backed node inspector slice for workflow detail and expose run-trace telemetry needed to power it.

- Updated dependencies [[`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868), [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79), [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e), [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f)]:
  - @codemation/core@0.8.0
  - @codemation/core-nodes@0.4.2
  - @codemation/eventbus-redis@0.0.30

## 0.2.5

### Patch Changes

- Updated dependencies [[`1c74067`](https://github.com/MadeRelevant/codemation/commit/1c74067a474b54a8d6c73f55db4c3d8d3e20e2ae)]:
  - @codemation/core-nodes@0.4.1

## 0.2.4

### Patch Changes

- Updated dependencies [[`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4), [`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4)]:
  - @codemation/core-nodes@0.4.0
  - @codemation/core@0.7.0
  - @codemation/eventbus-redis@0.0.29

## 0.2.3

### Patch Changes

- Updated dependencies [[`f451b1b`](https://github.com/MadeRelevant/codemation/commit/f451b1b4657b59406e15ce5f50b243e487ff99ed)]:
  - @codemation/core-nodes@0.3.0

## 0.2.2

### Patch Changes

- [#73](https://github.com/MadeRelevant/codemation/pull/73) [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348) Thanks [@cblokland90](https://github.com/cblokland90)! - Improve credential UX and add extensible advanced field presentation.
  - Run automatic credential health tests after create/save (including OAuth) and keep the dialog open when the test fails; auto-bind newly created credentials to empty workflow slots; auto-bind when picking an existing credential from the workflow slot dropdown while the slot is unbound.
  - Add `CredentialFieldSchema.visibility` (`default` | `advanced`) and optional `CredentialTypeDefinition.advancedSection` (advanced fields always render in a collapsible block; section labels default when omitted). Next host uses stable test ids and fixes collapsible chevron styling.
  - Credential dialog: title uses the credential type name (e.g. **Add …** / type display name on edit); hide the redundant type dropdown in edit mode.
  - Gmail OAuth: group Client ID with Client secret, move scope preset and custom scopes under an **OAuth scopes** advanced section (collapsed by default).
  - Documentation: `packages/core/docs/credential-ui-fields.md`, AGENTS.md, and credential development skill reference.

- Updated dependencies [[`3044e73`](https://github.com/MadeRelevant/codemation/commit/3044e73fd3cfb33f8e2cbc579c10baf97ed94658), [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348), [`3774fd8`](https://github.com/MadeRelevant/codemation/commit/3774fd80bc357c7eb39957f6963c692f322c38eb), [`00bc135`](https://github.com/MadeRelevant/codemation/commit/00bc1351e2dd6222d5101dbff3602a76ead33ce1), [`26ebe63`](https://github.com/MadeRelevant/codemation/commit/26ebe6346db0e9133a2133435a463c3dcd2dc537)]:
  - @codemation/core@0.6.0
  - @codemation/core-nodes@0.2.0
  - @codemation/eventbus-redis@0.0.28

## 0.2.1

### Patch Changes

- [#64](https://github.com/MadeRelevant/codemation/pull/64) [`c44dad2`](https://github.com/MadeRelevant/codemation/commit/c44dad26529ac557f69ec986930389cc799aaefb) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual run execution so trigger-started workflows synthesize trigger preview items when no upstream trigger data exists yet.

  Add a lightweight `@codemation/host/authoring` entrypoint and update plugin sandbox imports so local dev no longer pulls heavy host server persistence modules into discovered plugin packages.

## 0.2.0

### Minor Changes

- [#60](https://github.com/MadeRelevant/codemation/pull/60) [`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c) Thanks [@cblokland90](https://github.com/cblokland90)! - Harden the Gmail plugin so it imports reliably from the package root, returns an authenticated official Gmail session, and supports trigger/read/send/reply/label workflows with one OAuth credential.

  Add framework support for OAuth scope presets and custom per-credential scope replacement, and update the plugin starter/docs so future plugins scaffold the same publishable root-entrypoint conventions.

### Patch Changes

- Updated dependencies [[`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c)]:
  - @codemation/core@0.5.0
  - @codemation/core-nodes@0.1.1
  - @codemation/eventbus-redis@0.0.27

## 0.1.7

### Patch Changes

- Updated dependencies [[`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7), [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb)]:
  - @codemation/core@0.4.0
  - @codemation/core-nodes@0.1.0
  - @codemation/eventbus-redis@0.0.26

## 0.1.6

### Patch Changes

- Updated dependencies [[`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e)]:
  - @codemation/core@0.3.0
  - @codemation/core-nodes@0.0.25
  - @codemation/eventbus-redis@0.0.25

## 0.1.5

### Patch Changes

- Updated dependencies [[`d3a4321`](https://github.com/MadeRelevant/codemation/commit/d3a4321dc178df51dfd61cc6eb872ccca36bbcdb)]:
  - @codemation/core@0.2.3
  - @codemation/core-nodes@0.0.24
  - @codemation/eventbus-redis@0.0.24

## 0.1.4

### Patch Changes

- Updated dependencies [[`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f), [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f)]:
  - @codemation/core@0.2.2
  - @codemation/core-nodes@0.0.23
  - @codemation/eventbus-redis@0.0.23

## 0.1.3

### Patch Changes

- Updated dependencies [[`4989e9c`](https://github.com/MadeRelevant/codemation/commit/4989e9c7d97513c05904d47d2f85794ba716a4d3)]:
  - @codemation/core@0.2.1
  - @codemation/core-nodes@0.0.22
  - @codemation/eventbus-redis@0.0.22

## 0.1.2

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Integration tests: provision one shared Postgres in Vitest global setup when `DATABASE_URL` is unset (avoids per-suite Testcontainers flakes), with a cross-process lock when host and CLI integration projects run global setup together.

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize run persistence around work items, execution instances, and run slot projections, while aligning the HTTP/UI run detail flow to run-centric naming. This also fixes AI agent tool schema serialization, nested tool item propagation, and execution inspector/canvas status handling for inline scheduler workflows.

- Updated dependencies [[`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5)]:
  - @codemation/core@0.2.0
  - @codemation/core-nodes@0.0.21
  - @codemation/eventbus-redis@0.0.21

## 0.1.1

### Patch Changes

- [#39](https://github.com/MadeRelevant/codemation/pull/39) [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4) Thanks [@cblokland90](https://github.com/cblokland90)! - Integration tests: provision one shared Postgres in Vitest global setup when `DATABASE_URL` is unset (avoids per-suite Testcontainers flakes), with a cross-process lock when host and CLI integration projects run global setup together.

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/core@0.1.0
  - @codemation/core-nodes@0.0.20
  - @codemation/eventbus-redis@0.0.20

## 0.1.0

### Minor Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Move browser auth/session ownership into `@codemation/host` and make `@codemation/next-host` a thin UI client over the backend `/api/auth/*` surface.

  Update packaged dev/scaffolded flows so the CLI provides the public base URL and auth secret wiring needed for the new backend-owned session flow, and refresh the templates/docs to match the clean cutover away from the legacy NextAuth runtime.

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Align dev auth with the runtime API: proxy `/api/auth/*` through `CODEMATION_RUNTIME_DEV_URL` so SQLite has a single DB owner, tighten middleware path rules to avoid redundant session checks, and document root `pnpm dev` framework-author flow.

## 0.0.19

### Patch Changes

- [#26](https://github.com/MadeRelevant/codemation/pull/26) [`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual trigger reruns and current-state resume behavior.

  Current-state execution now treats empty upstream outputs like the live queue planner, so untaken branches stay dead on resume. Manual downstream runs can also synthesize trigger test items through core intent handling instead of relying on host-specific trigger logic.

- Updated dependencies [[`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0)]:
  - @codemation/core@0.0.19
  - @codemation/core-nodes@0.0.19
  - @codemation/eventbus-redis@0.0.19

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
- Updated dependencies [f0c6878]
  - @codemation/core@0.0.18
  - @codemation/core-nodes@0.0.18
  - @codemation/eventbus-redis@0.0.18
