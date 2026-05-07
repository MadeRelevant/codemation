# @codemation/next-host

## 0.4.0

### Minor Changes

- [#133](https://github.com/MadeRelevant/codemation/pull/133) [`d283b48`](https://github.com/MadeRelevant/codemation/commit/d283b481f01a1a259d38d25c1482006eff963384) Thanks [@cblokland90](https://github.com/cblokland90)! - feat: deep-link from parent run to specific subworkflow execution

  Adds `childRunId` to `NodeExecutionSnapshot` so the UI can navigate directly to the
  child run when a `SubWorkflow` node is selected in the execution inspector, instead of
  only linking to the child workflow's editor. Fixes the gap from PR [#131](https://github.com/MadeRelevant/codemation/issues/131).
  - `@codemation/core` (patch): `NodeExecutionSnapshot` gains `childRunId?: RunId`;
    `ExecutionInstanceDto` gains `childRunId?: string`;
    `NodeExecutionStatePublisher` gains optional `setChildRunId` method;
    `NodeExecutionSnapshotFactory` propagates `previous.childRunId` through
    `completed`, `failed`, and `skipped` transitions.
  - `@codemation/host` (minor): `ExecutionInstance` table gains `child_run_id` column
    (nullable, backward-compatible); `PrismaWorkflowRunRepository` persists and reads
    `childRunId` on node-activation snapshots.
  - `@codemation/next-host` (minor): `NodeExecutionSnapshot` type gains `childRunId`;
    `WorkflowExecutionInspectorDetailBody` renders "Open subworkflow run" (with
    `?run=<childRunId>`) when a child run id is present, falling back to
    "Open subworkflow editor" for pre-existing snapshots.

- [#131](https://github.com/MadeRelevant/codemation/pull/131) [`5b509e8`](https://github.com/MadeRelevant/codemation/commit/5b509e83e1e963e0c03cb0cbad018dc1fb0a04c5) Thanks [@cblokland90](https://github.com/cblokland90)! - feat: SubWorkflow editor link, workflow info popover, and child-run navigation
  - **2.3a** — SubWorkflow nodes in the node-properties panel now show an "Open in editor" link that navigates to the referenced workflow. Requires the new `referencedWorkflowId` field added to `WorkflowNodeDto` (populated from `SubWorkflow.workflowId` in `WorkflowDefinitionMapper` and `PersistedWorkflowSnapshotMapper`).
  - **2.3b** — A workflow info popover (ⓘ icon) appears in the detail-page header, showing workflow id, discovery-path segments, trigger type, and active status.
  - **2.4** — When a SubWorkflow node is selected in the execution inspector, an "Open workflow" link appears navigating to that child workflow's editor. Note: jump to the _specific child run_ is not yet possible because the parent's node execution snapshot does not carry the child `runId`; this is a backend follow-up item.

### Patch Changes

- [#130](https://github.com/MadeRelevant/codemation/pull/130) [`e8e3935`](https://github.com/MadeRelevant/codemation/commit/e8e39358a4282e0a780efb428ae0d71d105afd5f) Thanks [@cblokland90](https://github.com/cblokland90)! - `SubWorkflow` nodes now render with the Lucide `workflow` glyph by default, so they read at a glance on the canvas. Nodes that don't set an explicit `icon` (and have no semantic role like agent / model / tool) now fall back to a question-mark glyph instead of `Boxes` — a clearer "missing icon" signal for plugin authors. Unknown icon tokens (`builtin:`, `si:`, `lucide:` lookups that don't resolve) also fall back to the same question-mark glyph for consistency.

- Updated dependencies [[`d283b48`](https://github.com/MadeRelevant/codemation/commit/d283b481f01a1a259d38d25c1482006eff963384), [`5b509e8`](https://github.com/MadeRelevant/codemation/commit/5b509e83e1e963e0c03cb0cbad018dc1fb0a04c5)]:
  - @codemation/core@0.10.2
  - @codemation/host@0.6.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`1f10121`](https://github.com/MadeRelevant/codemation/commit/1f10121a093ef0612a33c873419b032709c9964d)]:
  - @codemation/core@0.10.1
  - @codemation/host@0.5.1

## 0.3.1

### Patch Changes

- Updated dependencies [[`847deb4`](https://github.com/MadeRelevant/codemation/commit/847deb4c42801632bfb970cdb2625cd0755241cb)]:
  - @codemation/core@0.10.0
  - @codemation/host@0.5.0

## 0.3.0

### Minor Changes

- [#100](https://github.com/MadeRelevant/codemation/pull/100) [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Major dev-server startup-time and bundle-size improvements, plus dev-CLI hardening.

  **Why this matters**

  Before this work, opening the workflow detail page on a 4-cpu / 8-GB WSL box would
  OOM-kill `next-server` mid-compile (~5 GB peak RSS). After: the page cold-compiles in
  **5.5 s** with peak **1.8 GB** and the dev server stays comfortably alive. The dev CLI
  also boots significantly faster and survives consumer-source errors without tearing
  the whole session down.

  **Hard numbers**
  - Workflow page Turbopack RSS peak: **5.0 GB → 1.8 GB** (-64%)
  - Workflow page cold compile time: **~14 s → ~5.5 s**
  - Lucide-react files in workflow page bundle: **1,713 → 74** (-95.7%)
  - Host package typecheck: **17.5 s / 4,093 files / 2.1 GB → 8.8 s / 2,806 files / 1.9 GB**
  - Host source tree: **-112,492 lines** of generated Prisma `.d.ts`
  - Host circular dep cycles: **92 → 21**
  - Core circular dep cycles: **53 → 50**

  **`@codemation/next-host`**
  - New `WorkflowCanvasLucideIconRegistry` — curated 18-icon set used by core node plugins.
    Replaces `lucide-react/dynamic` (which forced bundling of all 1,713 icons because it
    loads them by string at runtime). Workflows using `icon: "lucide:<unknown>"` now fall
    back to the `Boxes` icon and emit a one-time `console.warn`. **Plugin authors needing
    custom icons must ship SVG via `builtin:` / `si:` / URL tokens.**
  - New slim subpath exports on `@codemation/host`: **`@codemation/host/dto`**,
    **`@codemation/host/mapping`**, plus extensions to **`@codemation/host/client`**.
    All 65 deep `@codemation/host-src/*` imports replaced; `@codemation/host-src/*`
    tsconfig path removed. Prevents the UI from dragging the heavy host runtime graph
    through Turbopack on every UI route compile.
  - 42 lucide-react named imports rewritten to per-icon deep imports
    (`lucide-react/dist/esm/icons/<kebab>`).
  - Workflow detail page lazy-loads `WorkflowDetailScreenTestsView` and the
    Monaco-backed `WorkflowJsonEditorDialog`.
  - Removed `@codemation/core` and `@codemation/host` from `transpilePackages` and
    dropped the corresponding root-barrel tsconfig paths so Next loads them from
    compiled `dist/` instead of TypeScript source.
  - Dev: `EdgeSessionVerifier` resolves `/api/auth/session` via
    `x-forwarded-host` (the dev gateway) instead of `request.nextUrl.origin` (Next's
    loopback). Previously the auth-check fetch looped back into Next, forcing
    Turbopack to compile the catch-all `/api/[[...path]]` route on every page load.

  **`@codemation/host`**
  - Generated Prisma clients (`prisma-client`, `prisma-postgresql-client`,
    `prisma-sqlite-client`) moved out of `src/infrastructure/persistence/generated/`
    to `prisma-generated/` (sibling of `src/`). They're still typechecked and bundled
    by the host build, but no longer pollute the public source surface that downstream
    packages walk.
  - New **`@codemation/host/dto`**, **`@codemation/host/mapping`** subpath exports
    re-exposing only the contract DTO types and presentation factories the UI needs.
    The existing **`@codemation/host/client`** subpath gained `ApiPaths`,
    `BrowserLoggerFactory`, `logLevelPolicyFactory`, `InAppCallbackUrlPolicy`, and
    `Logger` so the UI no longer needs deep imports.

  **`@codemation/core`**
  - New **`@codemation/core/contracts`** subpath — re-exports only pure-type contracts
    (`assertionTypes`, `runTypes`, `workflowTypes`, etc.) using `export type *`. Type-only
    consumers can import from here to avoid dragging the workflow DSL runtime into their
    compile graph. Existing `@codemation/core` (root barrel) is unchanged for backwards
    compatibility.
  - Extracted `core/src/contracts/baseTypes.ts` (six fundamental id types) to break a
    long-standing `credentialTypes ↔ workflowTypes` cycle.

  **`@codemation/cli` — dev-CLI hardening**
  - **`DevHttpProbe`**: TCP-listener probe replaces the HTTP-response probe, so a slow
    Next dev cold compile no longer SIGTERMs the dev tree.
  - **Single-runtime swap** in `runQueuedRebuild`: stops the old in-process runtime
    before creating the new one, freeing ~1.5 GB during dev source-changes. Consumer
    errors are now non-fatal — the gateway returns 503 and the dev session stays up
    until the next save fixes the build.
  - **Workspace-plugin watch is now opt-in** via `CODEMATION_DEV_WATCH_PLUGINS=true`.
    By default `pnpm dev` no longer spawns `tsdown --watch` for each workspace plugin
    (saves ~500 MB baseline + the rebuild-loop pressure). Plugins still load from
    their existing `dist/` output; opt in only when actively editing a plugin's source.
  - **`DevSourceWatcher`**: 75 ms → 750 ms debounce so a single `tsdown` rebuild collapses
    into one runtime swap. Defense-in-depth ignore re-check at the event handler (chokidar
    doesn't always re-evaluate `ignored` for files created post-start). 20 s startup grace
    period to drop initial-build noise.
  - **Workspace plugin watch root** narrowed from `dist/` to the plugin's entry file —
    tsdown rewrites the entry once per real build, so one watch event per build instead of
    a dozen.
  - Removed `--conditions=development` from the Next-host's `NODE_OPTIONS`. Previously
    this resolved `@codemation/{core,host}` to TypeScript source; combined with
    `transpilePackages` it forced Turbopack to walk the full source tree on every
    UI route compile.

  **Architectural guard rails (no behavior change, prevent regressions)**
  - ESLint `no-restricted-imports` blocks `@codemation/host-src/*` and root
    `@codemation/host` from `next-host` UI; blocks `prisma-generated/*` outside host's
    persistence layer.
  - New **`dependency-cruiser`** config + `pnpm depcruise` script.
  - New **`knip`** config + `pnpm lint:knip` script.
  - New `tooling/scripts/check-circular-deps.mjs` + `pnpm lint:circular` wired into
    `pnpm lint` with frozen baselines (core: 50, host: 21, core-nodes: 73).
  - **`@next/bundle-analyzer`** wired up; `pnpm analyze` available for on-demand
    inspection (uses `next experimental-analyze` for Turbopack-mode introspection).
  - New `AGENTS.md` "Cross-package imports" section documenting the slim-subpath
    discipline and the rationale for it.

  The contract additions are strictly additive; no existing API surface changed shape.

- [#101](https://github.com/MadeRelevant/codemation/pull/101) [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535) Thanks [@cblokland90](https://github.com/cblokland90)! - Add collections: declare typed Postgres/SQLite-backed data tables in the codemation config via `defineCollection({...})`. Schema sync runs at runtime startup behind an advisory lock (Postgres) or in-process mutex (SQLite).

  Workflow access:
  - `ctx.collections.<name>.crud(...)` from inside custom node code
  - Six new canvas nodes: `CollectionInsert`, `CollectionGet`, `CollectionFindOne`, `CollectionList`, `CollectionUpdate`, `CollectionDelete`

  Operator surfaces:
  - HTTP API at `/collections/*`
  - CLI: `codemation collections list|show|rows|get|insert|update|delete|sync`
  - UI at `/collections`

  Destructive schema changes (column drops, type changes) require `CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE=1`.

  Out of scope (separate PRs):
  - Real leader election (advisory lock at boot is sufficient for sync; trigger double-firing during container swap is unaddressed)
  - Admin-role gating on the UI
  - Runtime user-defined schemas (Airtable-style)
  - Joins, aggregates, query DSL beyond indexed-field equality

- [#100](https://github.com/MadeRelevant/codemation/pull/100) [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Foundation for first-class **workflow testing**: a TestTrigger node, an IsTestRun branching node, an Assertion node, a `TestSuiteOrchestrator` service that fans one workflow run per yielded fixture item, host-side persistence (Prisma `TestSuiteRun` + `TestAssertion` tables, repositories, `TestRunnerService`), and a per-suite event tracker that records assertions and node coverage. HTTP routes and the canvas Tests tab (next-host) ship in follow-up slices.

  **What this slice adds**
  - **`@codemation/core` — additive contract changes**
    - `RunExecutionOptions.testContext?: { testSuiteRunId; testCaseIndex }` — set by the orchestrator on each test-case run; threaded through `ExecutionContext` so nodes can read it as `ctx.testContext`. Propagates to subworkflow runs via `ParentExecutionRef.testContext` + `EngineExecutionLimitsPolicy.mergeExecutionOptionsForNewRun`, so assertions emitted by subworkflows land under the correct parent test case.
    - `TriggerNodeConfig.triggerKind?: "live" | "test"` — `"test"` triggers are skipped by `TriggerRuntimeService` (live activation, webhooks, polling) and are only invoked by the orchestrator.
    - `NodeConfigBase.emitsAssertions?: true` — marker the host-side `TestAssertionPersister` (next slice) keys off when subscribing to `nodeCompleted`.
    - New `AssertionResult` type (`pass | fail | error`, plus `score`, `expected`, `actual`, `message`, `details`) — the stable shape every assertion node emits on `main`.
    - New `TestTriggerNodeConfig` + `TestTriggerSetupContext` — author callback signature returns `AsyncIterable<Item>` and exposes credential resolution + an `AbortSignal`.
    - New `RunEvent` kinds: `testSuiteStarted`, `testCaseStarted`, `testCaseCompleted`, `testSuiteFinished` (with terminal status `succeeded | failed | partial | cancelled | errored`).
    - New `TestSuiteOrchestrator` service in `orchestration/` — drives the iterator, applies a per-suite concurrency semaphore (default 4), dispatches one `engine.runWorkflow(...)` per item with `executionOptions.testContext` set, awaits terminal status, and publishes lifecycle events on the existing `RunEventBus`. No persistence, no HTTP — pure engine logic so tests can drive it via in-memory deps.
    - `TestSuiteRunIdFactory`, `AbortControllerFactory` — DI-friendly minters used by the orchestrator.
  - **`@codemation/core-nodes` — three new nodes**
    - **`TestTrigger`** / `TestTriggerNode`: drop on the canvas alongside live triggers. `setup` is a no-op; `execute` is a passthrough. The author's `generateItems` is consumed by the orchestrator.
    - **`IsTestRun`** / `IsTestRunNode`: per-item router with `true` / `false` ports. Routes to `true` iff `ctx.testContext` is set — lets workflows skip real side-effects in test runs (e.g. don't actually send the reply).
    - **`Assertion`** / `AssertionNode`: generic callback-style assertion node. Author returns `Promise<AssertionResult[]>` per item; the node emits one workflow `Item` per result. Sets `emitsAssertions: true` so the host persister can identify it.
    - Declarative shorthands (`StringEqualsAssertionNode`, `JudgeByAgentAssertionNode`) intentionally deferred — the generic callback node covers Phase 1 and the declarative variants compose on top.
  - **`@codemation/host` — persistence + orchestration + HTTP**
    - **Prisma schema**: new `TestSuiteRun` and `TestAssertion` tables in both Postgres and SQLite mirrors. Adds `Run.testSuiteRunId` (FK with `ON DELETE SET NULL`) and `Run.testCaseIndex` (indexed for join + ordering). Workflow definition itself is **not** FK'd — workflows live in code; `TestSuiteRun.triggerNodeName` is snapshotted at creation so historical viewing survives node renames/deletions.
    - **`TestSuiteRunRepository`** + **`TestAssertionRepository`** domain interfaces with Prisma + in-memory adapters.
    - **`TestRunnerService`** (host application layer) — single facade for "start a test suite": creates the persistence row, drives the orchestrator, awaits, finalizes counts + coverage. Subscribes to `RunEventBus.subscribeToWorkflow` only for the lifetime of one suite (no global subscriber, no shared mutable state across concurrent suites).
    - **`TestSuiteRunTracker`** + **`TestSuiteRunTrackerFactory`** — per-suite event accumulator. Two-stage event buffering tolerates inline runners that emit `nodeCompleted` synchronously inside `runWorkflow` (before the orchestrator publishes `testCaseStarted`); without it, fast/in-memory engines drop assertions silently.
    - **`AssertionResultGuard`** — type-guard the tracker uses to skip junk output if a misconfigured `emitsAssertions: true` node emits non-assertion items (defensive, not crash-on-bad-input).
    - **HTTP routes** (Hono, all behind the existing session-verifier middleware):
      - `POST /api/workflows/:workflowId/test-suite-runs` body `{ triggerNodeId, concurrency? }` → 201 with `{ testSuiteRunId, status, totalCases, passedCases, failedCases }`
      - `GET /api/workflows/:workflowId/test-suite-runs` → list summaries
      - `GET /api/test-suite-runs/:id` → detail (including `concurrency`, `nodeCoverage`, `errorMessage`)
      - `GET /api/test-suite-runs/:id/assertions` → all assertions across the suite's child runs
      - `GET /api/runs/:runId/assertions` → assertions for one child run
      - Paths exposed through `ApiPaths.workflowTestSuiteRuns/testSuiteRun/testSuiteRunAssertions/runAssertions` so the next-host React Query layer can call them by helper instead of string literals.
    - **DI bootstrap** in `AppContainerFactory`: registers all new singletons (factories, mappers, guard, repository selector, route handler + registrar) and wires Prisma vs in-memory `TestSuiteRunRepository` / `TestAssertionRepository` based on `appConfig.persistence.kind` (mirroring the existing `WorkflowRunRepository` selection). `TestSuiteOrchestrator` itself is registered via a tsyringe factory that injects `Engine` + the engine-side `RunEventBus` + a fresh `CredentialResolverFactory(CredentialSessionService)`.
    - **DTOs** in `application/contracts/TestingContracts.ts`: `StartTestSuiteRunRequest/Response`, `TestSuiteRunSummaryDto`, `TestSuiteRunDetailDto`, `TestAssertionDto`. Mappers (`TestSuiteRunSummaryMapper`, `TestAssertionMapper`) translate persistence records → wire shape.
    - **WebSocket / event narrowing** — `WorkflowWebsocketServer` and one integration test reader updated to type-narrow on the new test-suite event kinds (which carry `testSuiteRunId` rather than `runId`).

  **Tests**
  - `TestSuiteOrchestrator` unit suite (6 tests): per-item dispatch with `testContext`, partial-pass aggregation, lifecycle event emission, concurrency cap, `errored` status when `generateItems` throws, rejection of non-test triggers.
  - Node unit suite (6 tests): TestTrigger passthrough + `triggerKind === "test"`, IsTestRun routing on both branches, AssertionNode emitting one item per result, `emitsAssertions === true`.
  - `TestRunnerService` integration suite (2 tests): creates the persistence row, finalizes counts + coverage, persists 3 `TestAssertion` rows from a 2-case suite (one passing, one failing); rejects non-test triggers without leaving a phantom row.
  - **`@codemation/next-host` — Tests tab UI**
    - **Third canvas tab** ("Tests") next to Live workflow / Executions, mutually exclusive with both. Local React state for now (Phase 1) — promotion to the URL codec is a Phase 2 cleanup once the UX is settled.
    - **`TestsPanel`** — top-level container with a trigger picker (shadcn `Select` populated from workflow nodes whose `triggerKind === "test"`), a "Run tests" CTA wired through `useStartTestSuiteRunMutation`, a left list of past suite runs, and a right detail panel.
    - **`TestSuitePassRateChart`** — recharts line chart of pass rate over time across this workflow's suite runs. Carries an explicit `rolling-input` label so authors don't read trends as agent regressions when the underlying fixtures drift (Phase 2 ships snapshots).
    - **`TestSuiteRunsList`** + **`TestSuiteRunStatusBadge`** — list rows + colored status badges (`running` / `succeeded` / `partial` / `failed` / `cancelled` / `errored`).
    - **`TestSuiteRunDetailPanel`** — header with pass-rate + counts + concurrency + nodes-covered + (when set) an `errorMessage` callout; the body is a per-run grouped assertions list.
    - **`TestAssertionsList`** + **`TestAssertionRow`** — each assertion shows status badge, optional score, optional `expected`/`actual` JSON viewers side-by-side.
    - **React Query hooks** (`testSuiteHooks.ts`) cover all four GET endpoints plus the start mutation, with cache invalidation on `workflowTestSuiteRunsQueryKey` after a successful run.
    - **WorkflowNodeDto** + **mapper additions** (host + next-host's `PersistedWorkflowSnapshotMapper`) propagate `triggerKind` to the wire shape so the Tests panel can identify test triggers without server round-trips. Both mappers default omitted values to `"live"` to keep the wire DTO consistent.

  **Not in this slice (planned follow-ups)**
  - Test-input snapshots (Phase 2 — Phase 1 inputs are always live; UI carries a "rolling-input" label so charts aren't read as agent regressions).
  - Declarative assertion family (StringEquals, JsonPath, JudgeByAgent helpers — generic callback `Assertion` covers Phase 1).
  - Cancellation endpoint (`POST /api/test-suite-runs/:id/cancel`) — orchestrator already supports `AbortSignal` cancellation; the HTTP surface for it is deferred until the UI surfaces it.
  - Realtime updates on the Tests panel — currently the suite list refetches on mutation success; live `testSuite*` events arrive via the existing realtime bridge but the Tests panel doesn't subscribe yet.
  - URL codec entry for `pane=tests` so suite drilldowns are deep-linkable (currently in-memory React state).
  - Coverage heatmap overlay on the canvas itself.

  The contract additions are **strictly additive**; no existing API surface changed shape.

### Patch Changes

- [#110](https://github.com/MadeRelevant/codemation/pull/110) [`4902978`](https://github.com/MadeRelevant/codemation/commit/49029782243ece59ab6aa5bb46396db445cad47c) Thanks [@cblokland90](https://github.com/cblokland90)! - Add per-package `test:unit` scripts so Turbo can address each package individually for affected-only filtering. No runtime changes — dev-tooling only.

- [#104](https://github.com/MadeRelevant/codemation/pull/104) [`d22b91e`](https://github.com/MadeRelevant/codemation/commit/d22b91e6916edade7253747ee073a6f65ee9465a) Thanks [@cblokland90](https://github.com/cblokland90)! - Collections UI polish:
  - Click a collection name in `/collections` to open its rows (was a separate "View rows" link column).
  - Match the users / credentials design system: drop the card border around the rows table, use the shared `CodemationFormattedDateTime` for created/updated, plain text Edit/Delete buttons (size="sm") with destructive coloring on Delete, outline badges with muted-foreground text in the index.
  - Bulk delete: per-row checkbox + header select-all (with indeterminate state), "Delete selected (N)" button in the header, confirmation dialog. Implementation is sequential client-side delete via the existing single-row mutation. Selection drops rows that leave the page.

  Adds a shadcn `Checkbox` primitive (we only had `Switch`).

- [#109](https://github.com/MadeRelevant/codemation/pull/109) [`fb9f7fe`](https://github.com/MadeRelevant/codemation/commit/fb9f7fed9bf5a3d6b0c5f78a30027be3ab7bcaca) Thanks [@cblokland90](https://github.com/cblokland90)! - OAuth2 plugin authors can now declare `authorizeUrl` / `tokenUrl` (with `{publicFieldKey}` template substitution) directly on a credential type's `auth` definition — no core change required to add a new provider. Migrated `@codemation/core-nodes-msgraph` to use this for Microsoft tenant-templated URLs (fixes "Unsupported OAuth2 provider id: microsoft" on connect).

  Removed dead `@codemation/core-nodes-gmail` devDep from `@codemation/host` and the matching `serverExternalPackages` entry from `@codemation/next-host` so plugin-author `pnpm dev` no longer rebuilds gmail when working on an unrelated plugin.

  Softened the credentials UI's "Not set in host env: …" message: it's now an informational tip with neutral styling (was destructive/error styling), since the field works perfectly fine when filled in manually.

- [#100](https://github.com/MadeRelevant/codemation/pull/100) [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Workflow Testing UI polish and end-to-end correctness fixes.

  **`@codemation/next-host`** — Tests UI
  - Fix `Maximum update depth exceeded` on the Tests panel. The trends chart was receiving a
    fresh `[]` reference per render (`?? []` inline) which made recharts' internal effects loop;
    every `?? EMPTY_*` fallback the chart consumes is now a module-scoped stable reference.
  - Fix the same loop class on the canvas-play-dropdown → Tests path. The auto-start `useEffect`
    had `startMutation` (a react-query mutation result, unstable per render) in its deps array,
    which re-fired the mutation on every render. Now uses a ref keyed on `autoStartTriggerNodeId`
    with explicit reset when the prop clears.
  - Fix the canvas inspector showing `{ "json": {...} }` for historical / test-suite child runs.
    `WorkflowDetailPresenter.jsonValueToMainItems` was wrapping every array entry as
    `{ json: <entry> }`, but trigger outputs are persisted **already-Item-shaped**, producing
    `{json: {json: {...}}}`. Detects already-Item entries and passes them through.
  - Surface assertion-rollup-corrected status on the executions list. New `RunSummary.testCaseStatus`
    is preferred over engine `status` so a test-case run whose assertions failed shows as
    **failed** instead of "completed" (engine status is unchanged — only the UI display).
  - Tabs no longer overlap the test-cases detail panel — moved from absolute positioning to a flow
    header in the Tests view.
  - Filter strip above the case tree-table: All / Passing / Failing / Errored / In flight, with
    live counts. Empty buckets are disabled so users can't filter into a confusing empty state.
  - Collapse all / Expand all controls on the case tree-table; expansion state lifted from
    per-row `useState` to the table so broadcasts work. Auto-open-on-failure heuristic still fires
    per-row but only the first time each run id appears, so a row the user explicitly collapsed
    stays collapsed when realtime updates stream in.
  - Trend chart x-axis is now numeric `idx` with subsampled ticks (~5 evenly-spaced labels) and
    time-aware formatting (`HH:MM` when all runs share a day, `M/D HH:MM` across days).
  - Status icon expanded to cover the full case-status union (`succeeded` / `failed` / `errored` /
    `cancelled` / `running` / `queued`) with distinct icons and colors.

  **`@codemation/host`** — Testing framework correctness
  - Fix `TestSuiteRunTracker` race that left the last test case stuck on `testCaseStatus="running"`
    and the suite counters off by one. The bus dispatched events fire-and-forget; `finalize` ran
    before in-flight handlers wrote their `updateTestCaseStatus` calls. Tracker now serializes
    events through a `processingTail` chain and `finalize` awaits it before reading
    `listChildRuns`.
  - Initialize `Run.testCaseStatus` to `"running"` at row creation when `executionOptions.testContext`
    is present. Previously the tracker's `persistCaseStarted` raced the engine inserting the row
    and silently swallowed P2025 — the suite-detail page never showed a "running" transition.
  - `TestSuiteChildRunDto` exposes the new `testCaseStatus?: TestCaseRunStatus` field; mapper
    narrows the persistence string through a known-statuses guard.
  - `PrismaWorkflowRunRepository.listRuns` threads `testCaseStatus` into `RunSummary` so the
    executions list can render the corrected outcome.

  **`@codemation/core`**
  - `RunSummary` gains an optional `testCaseStatus?: TestCaseRunStatus`. Additive, non-breaking.

  **Dev experience**
  - `pnpm dev` (root) now runs `tsdown --watch` for `@codemation/host` alongside `test-dev` under
    `concurrently`, so host source edits rebuild `dist/` automatically. Without this, host changes
    were invisible to the running Next dev server (which deliberately resolves host from `dist/`
    to keep Turbopack memory bounded on 8 GB WSL boxes), forcing a manual
    `pnpm --filter @codemation/host build` after every host edit.

  **Documentation**
  - Top-level `docs/workflow-testing.md` and the `codemation-workflow-dsl` skill reference
    rewritten for the score-based assertion model (`score: 0..1` + `passThreshold?` + `errored?`),
    with examples for boolean assertions, continuous metrics, and judge-by-agent assertions.

  **Tests**
  - New HTTP-driven e2e suite (`packages/host/test/e2e/testSuiteRunHttpFlow.e2e.test.ts`) drives
    the full real-orchestrator + real-Prisma + real-engine lifecycle through `POST` →
    `GET /api/test-suite-runs/:id` → child runs → assertions, asserting the partial-suite
    outcome with assertion-rollup downgrade.
  - New unit tests cover the case-status filter engine, the historical-run double-wrap regression,
    and the chart prop-stability regression class.

- Updated dependencies [[`4902978`](https://github.com/MadeRelevant/codemation/commit/49029782243ece59ab6aa5bb46396db445cad47c), [`6566d55`](https://github.com/MadeRelevant/codemation/commit/6566d55c829f6631357ac95052b0852e86092ac5), [`a77505f`](https://github.com/MadeRelevant/codemation/commit/a77505f331d7d3892f3c1c8f19dc37952b4d96bd), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`fb9f7fe`](https://github.com/MadeRelevant/codemation/commit/fb9f7fed9bf5a3d6b0c5f78a30027be3ab7bcaca), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`6fc7d3f`](https://github.com/MadeRelevant/codemation/commit/6fc7d3fe95f8d88386c16971fffa8dd3faa7704f), [`781c146`](https://github.com/MadeRelevant/codemation/commit/781c146eb9d8bb8bdbc1963ea2a4b9abe4b7bfbf), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`3fe4213`](https://github.com/MadeRelevant/codemation/commit/3fe4213292bd0dd45af8de96d63e403dbc373b6b), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb)]:
  - @codemation/core@2.0.0
  - @codemation/host@1.1.0

## 0.2.4

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
  - @codemation/host@1.0.2

## 0.2.3

### Patch Changes

- [#95](https://github.com/MadeRelevant/codemation/pull/95) [`328c975`](https://github.com/MadeRelevant/codemation/commit/328c9759d45b711c177ea9a360ed4960ffdf5ffa) Thanks [@cblokland90](https://github.com/cblokland90)! - Migrate the workflow canvas to an ELK-based auto-layout pipeline so complex workflows—especially AI agent hierarchies and parallel `if` / `switch` branches—lay out reliably without manual node repositioning.

  Users cannot move nodes around on the canvas, so the framework must place them well by default. The previous Dagre-backed pipeline produced overlap, asymmetric branches, and "orphaned" LLM / tool connections on nested agents.

  **What changed**
  - **Engine**: replaced Dagre + bespoke overlap resolver with ELK (`elkjs`). Root graph uses ELK Layered (`elk.layered.layering.strategy: LONGEST_PATH`, `elk.layered.nodePlacement.strategy: BRANDES_KOEPF` with `fixedAlignment: BALANCED`) so parallel branches distribute symmetrically around the fork axis and terminal nodes align before merges. Agent compounds use ELK Box with role-aware aspect ratios (root compound 2.6, nested compound 2.0) so nested 1-LLM + 1-tool agents lay out side-by-side.
  - **Agent attachments**: two fixed, card-anchored source handles (`attachment-source-llm` at 30%, `attachment-source-tools` at 70%) on the bottom edge of every agent card, matched by LLM / TOOLS chips at the same percentages. Attachment edges render as bezier (React Flow `default`) so overlapping LLM + single-tool fan-outs each take their own arc instead of collapsing onto a shared horizontal segment.
  - **Spacing**: reduced default node-node (56 → 45 px) and between-layer (224 → 180 px) spacing by ~20% based on visual tuning.
  - **Deleted**: `WorkflowCanvasOverlapResolver` (and its tests) — the ELK pipeline places nodes without post-hoc overlap correction.
  - **Added**: `useAsyncWorkflowLayout` hook, `WorkflowElkGraphBuilder` / `WorkflowElkResultMapper`, and a shared `LayoutWorkflowTestKit` harness under `test/canvas/testkit/` that runs the real layout path with in-memory boilerplate.
  - **Pinned behaviour**: `test/canvas/layoutWorkflow.renderingRules.test.ts` groups 11 tests across 5 describe blocks (parallel branch merge alignment, symmetric fork placement, agent attachment edges, agent card dimensions, nested agent child packing), asserting on relative deltas rather than hardcoded pixel values.

  Dependency: adds `elkjs` to `@codemation/next-host`.

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

- Updated dependencies []:
  - @codemation/host@1.0.1

## 0.2.2

### Patch Changes

- Updated dependencies [[`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c), [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c)]:
  - @codemation/core@1.0.0
  - @codemation/host@1.0.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3)]:
  - @codemation/core@0.8.1
  - @codemation/host@0.3.1

## 0.2.0

### Minor Changes

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

- [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f) - Repair malformed AI tool calls inside the agent loop instead of replaying the whole agent node, and surface clearer debugging details when recovery succeeds or is exhausted.
  - classify repairable validation failures separately from non-repairable tool errors and preserve stable invocation correlation for failed calls
  - persist structured validation details and expose them in next-host inspector fallbacks, timelines, and error views
  - add regression coverage for repaired tool calls, exhaustion behavior, and mixed parallel tool rounds

- [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79) Thanks [@cblokland90](https://github.com/cblokland90)! - Polish the workflow inspector UI and stabilize canvas and resize interactions during panel resizing.

- Updated dependencies [[`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868), [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79), [`4c50f29`](https://github.com/MadeRelevant/codemation/commit/4c50f29763ad7bc1e39723a6711ca3cf9add5014), [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e), [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f), [`5d649ee`](https://github.com/MadeRelevant/codemation/commit/5d649ee878f417ad18159584941af6de0a55c0a7)]:
  - @codemation/core@0.8.0
  - @codemation/host@0.3.0

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.2.5

## 0.1.12

### Patch Changes

- Updated dependencies [[`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4)]:
  - @codemation/core@0.7.0
  - @codemation/host@0.2.4

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.2.3

## 0.1.10

### Patch Changes

- [#73](https://github.com/MadeRelevant/codemation/pull/73) [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348) Thanks [@cblokland90](https://github.com/cblokland90)! - Improve credential UX and add extensible advanced field presentation.
  - Run automatic credential health tests after create/save (including OAuth) and keep the dialog open when the test fails; auto-bind newly created credentials to empty workflow slots; auto-bind when picking an existing credential from the workflow slot dropdown while the slot is unbound.
  - Add `CredentialFieldSchema.visibility` (`default` | `advanced`) and optional `CredentialTypeDefinition.advancedSection` (advanced fields always render in a collapsible block; section labels default when omitted). Next host uses stable test ids and fixes collapsible chevron styling.
  - Credential dialog: title uses the credential type name (e.g. **Add …** / type display name on edit); hide the redundant type dropdown in edit mode.
  - Gmail OAuth: group Client ID with Client secret, move scope preset and custom scopes under an **OAuth scopes** advanced section (collapsed by default).
  - Documentation: `packages/core/docs/credential-ui-fields.md`, AGENTS.md, and credential development skill reference.

- Updated dependencies [[`3044e73`](https://github.com/MadeRelevant/codemation/commit/3044e73fd3cfb33f8e2cbc579c10baf97ed94658), [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348), [`3774fd8`](https://github.com/MadeRelevant/codemation/commit/3774fd80bc357c7eb39957f6963c692f322c38eb), [`00bc135`](https://github.com/MadeRelevant/codemation/commit/00bc1351e2dd6222d5101dbff3602a76ead33ce1)]:
  - @codemation/core@0.6.0
  - @codemation/host@0.2.2

## 0.1.9

### Patch Changes

- [#65](https://github.com/MadeRelevant/codemation/pull/65) [`261c240`](https://github.com/MadeRelevant/codemation/commit/261c240bccfd6e65bcd7cac439d501ef61b1f730) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix live workflow binary links so run-backed attachments open from the run binary endpoint instead of the debugger overlay endpoint, which avoids 404s for Gmail and other real execution binaries.

- [#64](https://github.com/MadeRelevant/codemation/pull/64) [`c44dad2`](https://github.com/MadeRelevant/codemation/commit/c44dad26529ac557f69ec986930389cc799aaefb) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual run execution so trigger-started workflows synthesize trigger preview items when no upstream trigger data exists yet.

  Add a lightweight `@codemation/host/authoring` entrypoint and update plugin sandbox imports so local dev no longer pulls heavy host server persistence modules into discovered plugin packages.

- Updated dependencies [[`c44dad2`](https://github.com/MadeRelevant/codemation/commit/c44dad26529ac557f69ec986930389cc799aaefb)]:
  - @codemation/host@0.2.1

## 0.1.8

### Patch Changes

- Updated dependencies [[`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c)]:
  - @codemation/core@0.5.0
  - @codemation/host@0.2.0

## 0.1.7

### Patch Changes

- [#56](https://github.com/MadeRelevant/codemation/pull/56) [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Add fluent workflow authoring support for port routing and core nodes.
  - `workflow()` DSL: add `route(...)`, `merge(...)`, and `switch(...)` helpers so multi-port graphs can be expressed without manual `edges`.
  - `Callback`: allow returning `emitPorts(...)` and configuring declared output ports and error handling options.
  - Next host: fix execution inspector tree nesting by preferring `snapshot.parent.nodeId` when available (nested agent/tool invocations).

- Updated dependencies [[`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7), [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb)]:
  - @codemation/core@0.4.0
  - @codemation/host@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [[`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e)]:
  - @codemation/core@0.3.0
  - @codemation/host@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [[`d3a4321`](https://github.com/MadeRelevant/codemation/commit/d3a4321dc178df51dfd61cc6eb872ccca36bbcdb)]:
  - @codemation/core@0.2.3
  - @codemation/host@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [[`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f), [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f)]:
  - @codemation/core@0.2.2
  - @codemation/host@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [[`4989e9c`](https://github.com/MadeRelevant/codemation/commit/4989e9c7d97513c05904d47d2f85794ba716a4d3)]:
  - @codemation/core@0.2.1
  - @codemation/host@0.1.3

## 0.1.2

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize run persistence around work items, execution instances, and run slot projections, while aligning the HTTP/UI run detail flow to run-centric naming. This also fixes AI agent tool schema serialization, nested tool item propagation, and execution inspector/canvas status handling for inline scheduler workflows.

- Updated dependencies [[`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5)]:
  - @codemation/host@0.1.2
  - @codemation/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4), [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/host@0.1.1
  - @codemation/core@0.1.0

## 0.1.0

### Minor Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Move browser auth/session ownership into `@codemation/host` and make `@codemation/next-host` a thin UI client over the backend `/api/auth/*` surface.

  Update packaged dev/scaffolded flows so the CLI provides the public base URL and auth secret wiring needed for the new backend-owned session flow, and refresh the templates/docs to match the clean cutover away from the legacy NextAuth runtime.

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Align dev auth with the runtime API: proxy `/api/auth/*` through `CODEMATION_RUNTIME_DEV_URL` so SQLite has a single DB owner, tighten middleware path rules to avoid redundant session checks, and document root `pnpm dev` framework-author flow.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

- Updated dependencies [[`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff), [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff), [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff)]:
  - @codemation/host@0.1.0

## 0.0.21

### Patch Changes

- [#33](https://github.com/MadeRelevant/codemation/pull/33) [`790e114`](https://github.com/MadeRelevant/codemation/commit/790e11456a19abe0db8ac4eca93b3357ea69e163) Thanks [@cblokland90](https://github.com/cblokland90)! - Publish a patch release to validate the full scaffolded auth startup release path from the packaged CLI through the packaged Next host.

  Keep the release loop exercised after tightening `main` to PR-only merges and after adding scaffolded browser coverage for auth-session startup.

## 0.0.20

### Patch Changes

- [#28](https://github.com/MadeRelevant/codemation/pull/28) [`b39cc51`](https://github.com/MadeRelevant/codemation/commit/b39cc51925162b5b46ac9d9653f3d9bf4a1eaf73) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix Gmail trigger preview/manual-run regressions and restore fresh scaffold auth startup in the packaged Next host.

  Clarify the trigger item contract so integrations emit one workflow item per external event instead of wrapper payloads.

- Updated dependencies []:
  - @codemation/host@0.0.19

## 0.0.19

### Patch Changes

- Updated dependencies [[`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0)]:
  - @codemation/core@0.0.19
  - @codemation/host@0.0.19

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
- Updated dependencies [f0c6878]
  - @codemation/core@0.0.18
  - @codemation/host@0.0.18
