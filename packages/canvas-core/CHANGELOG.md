# @codemation/canvas-core

## 0.2.1

### Patch Changes

- Updated dependencies [[`6efde7a`](https://github.com/MadeRelevant/codemation/commit/6efde7aa045050cd2fbd22015f7608c513a6f79f)]:
  - @codemation/host@0.9.1

## 0.2.0

### Minor Changes

- [#170](https://github.com/MadeRelevant/codemation/pull/170) [`0b3d2a3`](https://github.com/MadeRelevant/codemation/commit/0b3d2a3dc379c0d8a6509ae97e47f6bb880caea3) Thanks [@cblokland90](https://github.com/cblokland90)! - feat(credentials): app gallery API (framework half)

  Adds the framework-side credential "app gallery" surface that the control
  plane's credentials gallery UI consumes:
  - `@codemation/host`: a `GET /api/credentials/apps` endpoint backed by a new
    `GetCredentialAppsQuery` / handler and an `AppGalleryProjector` that projects
    the configured credential types + connected instances into `AppGalleryEntry`
    rows (`AppsResponse`). Wired through `CredentialContractsRegistry`,
    `ApiPaths.credentialApps()`, the credential route registrar/handler, and DI.
  - `@codemation/canvas-core`: `WorkflowCanvasApiClient.fetchCredentialApps()`,
    the `credentialAppsQueryKey`, and a `useCredentialAppsQuery` hook.
  - `@codemation/next-host`: `NextHostApiClientAdapter.fetchCredentialApps()` so
    the dev shell satisfies the canvas API client contract.

### Patch Changes

- [#173](https://github.com/MadeRelevant/codemation/pull/173) [`01f6b48`](https://github.com/MadeRelevant/codemation/commit/01f6b489870b8d73aaba28222ab56700a4582e31) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix second `credentials: "omit"` site in `createWorkflowCanvasApiClient` — the
  debugger-overlay binary upload helper had the same conditional as the primary
  fetch helper (`token === null ? "same-origin" : "omit"`), which breaks the
  upload when the canvas client is configured against a same-origin proxy whose
  upstream gate requires the session cookie. Now always `"same-origin"`, matching
  the primary helper fixed in [#171](https://github.com/MadeRelevant/codemation/issues/171).

- [#167](https://github.com/MadeRelevant/codemation/pull/167) [`3044474`](https://github.com/MadeRelevant/codemation/commit/3044474495525490735510ff74500b53761284b6) Thanks [@cblokland90](https://github.com/cblokland90)! - feat(hitl): Human-in-the-Loop — engine suspend/resume, inbox approval node + channels (local + control-plane), agent-as-tool, decision/timeout handling, inbox decision UX (toast + node status icons + "waiting for approval"), plus the consolidated dev/canvas/host fixes shipped alongside.

- Updated dependencies [[`0b3d2a3`](https://github.com/MadeRelevant/codemation/commit/0b3d2a3dc379c0d8a6509ae97e47f6bb880caea3), [`3044474`](https://github.com/MadeRelevant/codemation/commit/3044474495525490735510ff74500b53761284b6), [`0b3d2a3`](https://github.com/MadeRelevant/codemation/commit/0b3d2a3dc379c0d8a6509ae97e47f6bb880caea3)]:
  - @codemation/host@0.9.0
  - @codemation/core@0.12.0

## 0.1.2

### Patch Changes

- [#149](https://github.com/MadeRelevant/codemation/pull/149) [`150e4f0`](https://github.com/MadeRelevant/codemation/commit/150e4f0252efe79141dec86f922af25b51197aa1) Thanks [@cblokland90](https://github.com/cblokland90)! - Execution-inspector tree rows for MCP tool invocations now show the actual tool name (e.g. `search_threads`, `send_email`) as the primary label instead of repeating the MCP server's display name for every child row. Pulled from the `subjectName` field on `ConnectionInvocationRecord` (already populated by `AgentMcpIntegrationImpl.wrapToolExecutes`), so no other layer changes are required.

  LLM connection nodes and node-backed agent tools are unaffected — they leave `subjectName` unset and the row inherits the base connection node name as before.

- Updated dependencies [[`e0933eb`](https://github.com/MadeRelevant/codemation/commit/e0933ebc51806a9593f94758860c591b8346a7a5), [`a70e182`](https://github.com/MadeRelevant/codemation/commit/a70e182a852026e4f6d8f317fe9862417dc23ce6), [`5315e23`](https://github.com/MadeRelevant/codemation/commit/5315e2361492560601ac2c97491aa58c49346fd4), [`ac860a5`](https://github.com/MadeRelevant/codemation/commit/ac860a5af1df3e5766581e644fef8cc0d1b24eba), [`8ac207a`](https://github.com/MadeRelevant/codemation/commit/8ac207ab263542e46fad0b9e1ea584fbb71a747c), [`3025b86`](https://github.com/MadeRelevant/codemation/commit/3025b8685b0d7ad60c506b5a0f21967e681a25ea)]:
  - @codemation/core@0.11.1
  - @codemation/host@0.8.0

## 0.1.0

### Minor Changes

- 8285ec0: feat(canvas-core): split useWorkflowDetailController into five sub-controllers (Story F)

  Extracts the 1.5k-LOC `useWorkflowDetailController` mega-hook into five focused sub-controllers:
  - `useWorkflowRunController` — run start/stop, status, current step, run history, credential health.
  - `useWorkflowInspectController` — node selection, inspector panel state, resize, properties panel.
  - `useWorkflowPinController` — pinned-output editing (toggle, edit, clear).
  - `useWorkflowJsonEditController` — modal JSON editor dialog state.
  - `useWorkflowTestSuiteController` — NEW standalone controller for test-suite state (not part of façade).

  The original `useWorkflowDetailController` is preserved as a façade that composes the four run/inspect/pin/json-edit sub-controllers and returns the same shape it always did — no breaking changes for existing consumers.

  Each sub-controller ships with:
  - A typed return interface (`Workflow*ControllerReturn.types.ts`)
  - A compile-time contract test that pins the return type against the interface

  All new hooks and types are re-exported from the package public surface.

- 8285ec0: feat(canvas): extract @codemation/canvas-core headless package (Story E)

  Splits `@codemation/canvas` into two packages:
  - `@codemation/canvas-core` (new) — headless layer: data hooks (`useWorkflowDetailController`,
    `useWorkflowsQuery`, etc.), realtime infrastructure, ELK layout engine, types, and contexts.
    Zero React component exports; `.tsx` files banned by ESLint.
  - `@codemation/canvas` — becomes a compat shim that re-exports everything from `canvas-core`
    plus keeps its own UI components (screens, panels, canvas graph renderer).

  Existing consumers (`@codemation/next-host`, `@platform/customer-ui`) compile with zero source
  changes thanks to the wide `export *` compat shim.

- 8285ec0: Fix canvas edge/label flicker by switching to React Flow controlled mode with a surgical realtime patch pipeline.
  - `WorkflowCanvas` now uses `useNodesState`/`useEdgesState` (controlled mode) with a two-track update strategy: ELK layout seeds the canvas once per structural change; realtime events apply minimal `NodeReplaceChange`/`EdgeReplaceChange` patches via `useWorkflowCanvasRealtimePatches`
  - `WorkflowCanvasRealtimePatchPlanner` computes the minimal set of node and edge changes per realtime snapshot event, short-circuiting when no visible state changed
  - `useWorkflowCanvasRealtimePatches` hook wires the planner into the controlled canvas state, resetting prev-snapshot tracking after a re-seed
  - Monotonic snapshot merge in `realtimeRunMutations` prevents canvas from regressing (e.g. `completed → queued`) when converging branches re-activate a node
  - New `computeWorkflowPositionedLayout` separates ELK position resolution from the React Flow overlay so realtime events never trigger a full ELK re-layout
  - Eliminates edge drops caused by `useRunQuery` returning `undefined` for one render cycle when `activeLiveRunId` changes from null to a new value

- 8285ec0: Add slot render props and layout toggles to WorkflowDetailScreen (Story G).

  **New slot props on `WorkflowDetailScreen`** (all optional; default rendering preserved when omitted):
  - `renderHeader?: (ctx: WorkflowDetailHeaderSlotContext) => ReactNode`
  - `renderTabs?: (ctx: WorkflowDetailTabsSlotContext) => ReactNode`
  - `renderInspector?: (ctx: WorkflowDetailInspectorSlotContext) => ReactNode`
  - `renderLoadingState?: () => ReactNode`
  - `renderEmptyState?: () => ReactNode`
  - `renderRunButton?: (ctx: WorkflowDetailRunButtonSlotContext) => ReactNode`

  **New layout toggles**:
  - `hideRunsPaneSidebar?: boolean` — collapses the grid from 2-col to 1-col
  - `hideTabs?: boolean` — removes the tab strip area

  **New exports from `@codemation/canvas-core`**:
  - `WorkflowDetailHeaderSlotContext`
  - `WorkflowDetailTabsSlotContext`
  - `WorkflowDetailInspectorSlotContext`
  - `WorkflowDetailRunButtonSlotContext`
  - `InspectorSlotInspect`

  Default sub-components extracted from `WorkflowDetailScreen` into `packages/canvas/src/screens/defaults/`:
  `DefaultHeader`, `DefaultTabs`, `DefaultInspector`, `DefaultLoadingState`, `DefaultEmptyState`, `DefaultRunButton`.

### Patch Changes

- 8285ec0: Pack agent attachment children side-by-side on the canvas instead of stacking them vertically when the compound has two children (LLM + tool / MCP). The previous root/nested aspect ratios (2.6 / 2.0) were tight enough that ELK's box algorithm picked a vertical stack for the common LLM-plus-one-tool shape — visible in the Sprint 2 gmail-agent-smoke workflow where the Gmail MCP attachment landed below OpenAI instead of beside it. Raised to 6.0 / 4.0, which lets two attachments sit in a single readable row matching the LLM/TOOLS chip slots on the parent card.
- 8285ec0: Add a `statusLabel` field to `ConnectionInvocationRecord` / `ConnectionInvocationAppendArgs` so connection invocations can carry a short human-readable description of what they are doing (e.g. `"calling search_messages"`). The engine-side `NodeRunStateWriter` persists it; the canvas-side mirror picks it up via the standard patch projection.

  Wire per-MCP-tool-call lifecycle invocations through `AgentMcpIntegration`. `prepareMcpTools` now accepts an optional `appendMcpInvocation` callback (plus the agent activation / iteration / item / parent-invocation context). When the host-side `AgentMcpIntegrationImpl` wraps a tool's `execute`, it emits a `running` record with `statusLabel: "calling <toolName>"` and a matching `completed` or `failed` record; the existing telemetry span and 403 `NeedsReconsentEvent` paths are preserved. `@codemation/canvas-core` exposes a `CurrentStatusLabelSelector` and `WorkflowCanvasNodeData.currentStatusLabel`; `@codemation/canvas` renders the latest non-empty label as a sub-line under the node card. The two capabilities work together: MCP tool calls under an agent now stream the same invocation events the LLM and node-backed tool paths already emit, and the canvas surfaces the running label per-node.

- 8285ec0: test(canvas-core): push coverage to ≥90% (Sprint 16 Story 01 — canvas-core work unit)

  Added targeted tests for pure utility classes covering previously uncovered branches:
  WorkflowCanvasBuiltinIconRegistry, WorkflowCanvasEdgeStyleResolver,
  WorkflowCanvasLucideIconRegistry, WorkflowCanvasNodeGeometry (extended geometry methods),
  WorkflowCanvasLabelLayoutEstimator (long-word edge cases), WorkflowCanvasEdgeCountResolver
  (languageModel/nestedAgent fallback paths), HumanFriendlyTimestampFormatter,
  WorkflowQueryRetryPolicy, WorkflowDetailUrlCodec, WorkflowActivationHttpErrorFormat,
  RunRoomSubscriptionTracker, PageVisibilityIdleTimer, realtimeQueryKeys,
  WorkflowExecutionTreeBuilder, useWorkflowJsonEditController, and context hooks.

  Configured coverage.all: true + include: src/\*\* with documented exclusions for type-only
  files, ELK async layout, hook files requiring TanStack Query context, and large
  factory/adapter files covered by canvas package integration tests.

  Lines coverage: 94.46% (well above the new 90% threshold).

- 8285ec0: test(canvas-core): cover inspect/run/pin controllers (Sprint 14 coverage)

  Extends behavior test suites for the three canvas-core workflow detail controllers,
  bringing each above the 90% per-file coverage threshold:
  - `useWorkflowInspectController`: 92%→96% stmts / 89%→95% funcs. New tests cover
    stale properties-panel eviction on workflow structure change, selectedCanvasNodeId
    eviction, port selection find callbacks, focusedInvocationIdInPropertiesPanel
    matching, and the error-appears-on-same-selection mode auto-switch (ref-based branch).
  - `useWorkflowPinController`: 86%→98% stmts / 85%→100% funcs. New tests cover
    edge-contributed output ports (filter/map callbacks), non-main port alphabetic sort
    (localeCompare branch), preferredPort-in-fallback-list return, hasNodeErrorHandler
    with declared ports, and the no-declared-ports error-handler fallback.
  - `useWorkflowRunController`: 77%→91% stmts / 74%→94% funcs. New tests cover
    replaceDebuggerOverlay success + error paths, copySelectedRunToLive success + error
    - no-op when no run, persistWorkflowSnapshotUpdate success + error swallow, stale
      selectedRunId eviction, in-flight double-run guard, pinnedNodeIds filter callback,
      pendingSelectedRun prepend path, workflow-structure-change reset effect, and
      setWorkflowActive onSuccess clear.

- 8285ec0: fix(canvas-core): render MCP server connection children on agent canvas

  PersistedWorkflowSnapshotMapper.toAttachmentNodes now iterates
  agentConfig.mcpServers (both shorthand string[] and record forms) to
  synthesize canvas attachment nodes for MCP servers that are not yet
  materialized in snapshot.nodes. Mirrors the existing tool-slot
  synthesis path with role "tool" and a stable ConnectionNodeIdFactory
  mcpConnectionNodeId.

- 8285ec0: test(canvas-core/realtime): WebSocket harness + useWorkflowRealtimeInfrastructure coverage (Sprint 14 coverage)

  Adds 57 tests across 10 describe blocks covering `useWorkflowRealtimeInfrastructure`:
  - Dev-health polling gate (`/api/dev/health` interval, `skipDevHealthCheck` fast-path)
  - Connect/reconnect lifecycle (open, close, error listeners; 4401 forced-token-refresh path)
  - Message dispatch router (`handleRealtimeServerMessage` — all `kind` arms including runSaved, nodeQueued/Started/Completed/Failed, workflowChanged, devBuildStarted/Completed/Failed, telemetryEvent)
  - Minimum visibility delay (300ms nodeCompleted/nodeFailed hold)
  - Subscription management (`retainWorkflowSubscription`, `retainRunSubscription`, ref-counting, drain on open, reconnect re-subscribe)
  - PageVisibilityIdleTimer auto-unsubscribe/re-subscribe on tab hide/show
  - Dev-gateway socket buildState machine (building/idle/errored)

  Achieves 90.25% line coverage on the target file (up from 0%).

- 8285ec0: Demote routine `workflow-realtime.frontend` logs to debug level (per-event/per-frame messages: snapshot events, subscriptions, raw websocket frames, rebuild notifications). Important transitions (websocket enabled, transport opened, token expired) stay at info. Reduces console noise during normal dev/runtime; full verbosity still available via `CODEMATION_LOG_LEVEL=debug`.
- 8285ec0: feat(canvas): topological status cap — mask premature fan-in completion in canvas rendering

  Adds `WorkflowCanvasTopologicalStatusCap` which ensures the canvas never displays a node as more progressed than its slowest sequential upstream. In fan-out/fan-in patterns (e.g. `.if()` emitting to both a branch and a downstream merge node simultaneously), the merge node now stays in `running` state visually until all branch predecessors reach a terminal state. Engine truth is untouched; this is a pure visualization projection applied in the patch planner and the seed effect.

- 8285ec0: Fix workflow detail screen hydration mismatch caused by overlay siblings (tabs, run button, error banner, realtime badge) being rendered conditionally on controller state that diverges between SSR and a warm React Query client cache. Overlay siblings are now gated behind the same `hasMounted` flag as the canvas root.

  Render AIAgent MCP-server attachments in the canvas. `WorkflowDefinitionMapper` (the server-side mapper that feeds `/api/workflows/:id`) now passes an `McpServerResolver` backed by the host's `McpServerCatalog` to `AgentConnectionNodeCollector.collect`, so virtual connection nodes for declared `mcpServers` are emitted alongside the LLM and tool children. The MCP descriptor itself carries `icon: "lucide:plug"` and `lucide:plug` is added to the curated `WorkflowCanvasLucideIconRegistry` so MCP servers render with a distinct icon on the synchronous zero-HTTP path.

- 8285ec0: Add optional `subjectName?: string` to `ConnectionInvocationRecord` and `ConnectionInvocationAppendArgs` — a stable identifier for the thing an invocation acts on that persists across status transitions. The MCP integration's `wrapToolExecutes` sets it to the tool name on every transition (running / completed / failed), so the inspector's tool-call timeline entries can render `"Tool call · <toolName>"` for MCP servers (which expose many tools through a single connection node) instead of an opaque `"Tool call"`.

  For node-backed agent tools, the parent connection node id already encodes the tool name — `subjectName` stays unset there and the inspector renders the existing `"Tool call"` title unchanged.

  `statusLabel` (the running-only sentence rendered on the canvas card sub-line) is unchanged; `subjectName` is the persistent structural sibling used by the inspector.

- 8285ec0: Coverage Phase 2: testkits (LoggerTestKit, McpTestKit, CoreNodesTestContextFactory,
  TelemetryTestKit, GmailTestKit, AppConfigFixturesFactory, HookTestkit), per-package
  vitest coverage thresholds, and new tests on previously zero-coverage critical paths
  (mergeNode, switchNode, waitNode, connectionCredentialNode, canvas-lib pure, hook smoke).
  No production code changes.
- 8285ec0: Fix three browser-visible regressions on the workflow detail / canvas screen (Sprint 13 Story G).

  **Bug 1 — Hydration mismatch on canvas mount:** `WorkflowDetailScreen` now gates canvas rendering behind a `hasMounted` effect so the server and first client render both produce the loading placeholder. Previously a warm React Query cache could cause the client to render `WorkflowCanvas` while the server rendered `DefaultLoadingState`, producing a React hydration error.

  **Bug 2 — clock.svg 404:** `WorkflowCanvasLucideIconRegistry` now includes the `Clock` icon from `lucide-react`. Previously `CronTrigger`'s `lucide:clock` icon fell through to the remote-glyph path, which issued a redundant HTTP request to `/api/lucide-icon/clock.svg` (the route works, but the curated registry is the zero-HTTP fast path).

  **Bug 3 — MCP attachment node invisible/unselectable:** `PersistedWorkflowSnapshotMapper.toTopLevelNodes` no longer early-returns when all connection-slot children are already materialized. The previous early return skipped `toAttachmentNodes()` — the only code path that emits MCP attachment nodes — because `allConnectionChildrenMaterialized` only examined `snapshot.connections` (tool/LLM wiring), not `config.mcpServers`. MCP nodes are now always emitted and are visible and clickable on the canvas.

- 8285ec0: Remove the MCP credential bypass on AI agents. `AIAgent.mcpServers` is now a plain
  `ReadonlyArray<string>` of server ids — the inline `{ credential }` field is gone. Each
  declared server surfaces a standard credential slot on the agent node (key
  `mcp:<serverId>`, label and accepted types from the MCP catalog) and binds through the
  same `CredentialBinding` table as every other slot. At execute time the host resolves the
  binding via `getBinding({ workflowId, agentNodeId, slotKey: mcp:<serverId> })`, then opens
  the MCP pool with the resolved credential instance — no more reading the credential id
  out of the workflow config.

  Breaking — config shape change. Replace:

  ```ts
  mcpServers: {
    gmail: {
      credential: "<instanceId>";
    }
  }
  ```

  with:

  ```ts
  mcpServers: ["gmail"];
  ```

  Then bind the credential through the canvas credential dropdown before activating the
  workflow, the same way trigger credentials are bound. The `McpServerBindings` /
  `McpServerExplicitBinding` types are removed from `@codemation/core`;
  `AgentMcpIntegration.prepareMcpTools` now takes `{ workflowId, agentNodeId, serverIds }`.

- 8285ec0: fix: validate edge output ports against declared node ports at load time

  Adds `WorkflowEdgePortValidator` to `@codemation/core`. The validator checks that every edge's `from.output` port is declared by the source node's `declaredOutputPorts`; nodes without declared ports are treated as unconstrained (legacy behaviour).

  The validator is wired into `WorkflowDefinitionExportsResolver` in `@codemation/host`, which is the common chokepoint for both the `CodemationConsumerConfigLoader` and `CodemationConsumerAppResolver` load paths. On violation, all errors are reported at once so an agent can self-correct in a single pass.

  `WorkflowElkPortInfoResolver` in `@codemation/canvas-core` is tightened to render _exactly_ the declared ports (plus the synthetic `error` port when applicable) when a node has `declaredOutputPorts`, preventing phantom handles from rogue edges on the canvas. Legacy nodes without declared ports continue to infer ports from edges as before.

  Root cause: an LLM agent created an `If` workflow node (declares `["true", "false"]`) with a rogue edge using `output: "main"`, which the canvas unioned into the port list, producing a phantom third handle.

- 8285ec0: Move `simple-icons` SVG data out of the client bundle. Named imports from the ~5.2 MB `simple-icons` barrel are replaced by a server-side `/api/si-icon/[slug]` route that reads SVG files from disk, mirroring the `lucide-react` fix from commit 54c3a392. Canvas `si:` icons now render via CSS `mask-image` (same pattern as lucide remote glyphs). OAuth provider icons switch to a small inline path+hex map, eliminating the barrel import entirely. `simple-icons` removed from `optimizePackageImports` in `next.config.ts` as it is no longer imported client-side.
- 8285ec0: test(ui): UI security tests + test-suite orchestration (Sprint 13 Story G)
  - Fix `tooling/vitest/ui.config.ts` to include `next-host`, `canvas`, and `canvas-core` UI test suites — previously only `host` was wired.
  - Add `packages/canvas/test/bundleBoundary.test.ts` and `packages/canvas-core/test/bundleBoundary.test.ts`: static import-graph walk asserting no server-only imports leak into browser bundles.
  - Add `packages/next-host/test/features/users/UsersInviteDialog.test.tsx`: RHF + Zod email validation (valid submit, invalid email, empty email, server error).
  - Add `packages/next-host/test/features/invite/InviteAcceptScreen.test.tsx`: verify-state gate, password mismatch, password length, and successful activation.
  - Add `packages/canvas/test/screens/WorkflowDetailScreen.renderWorkflowJsonEditor.test.tsx`: slot override contract (no override / with override / updated context).
  - Add `packages/canvas/test/screens/WorkflowDetailScreen.fullMount.smoke.test.tsx`: full-mount smoke confirming slot wiring in the real component.
  - Add `packages/next-host/vitest.ui.config.ts`: jsdom-only config scoped to `*.test.tsx` for the UI suite.

- 8285ec0: Sprint 9 Story J cleanup: remove dead WorkflowDetailControllerReturn.types.ts (~101 LOC). The type was a parallel definition never imported by any consumer — confirmed via grep across both repos. canvas-core's public API is unchanged.
- 8285ec0: Make the unit-test suite pass on Windows.
  - `PrismaMigrationDeployer`: read `CODEMATION_PRISMA_CLI_PATH`, `CODEMATION_PRISMA_CONFIG_PATH`, `CODEMATION_HOST_PACKAGE_ROOT` from the `env` argument passed to `deploy(...)`/`deployPersistence(...)` instead of `process.env` at call time. Tests can now pass their CLI path through the deployer's existing `env` parameter rather than mutating shared `process.env`, removing the cross-file env-race that flaked SQLite deployer tests under thread-pool parallelism.
  - `NodeInspectorTelemetryPresenter` + `DashboardCostAmountFormatter`: pin currency formatting to `en-US` with `currencyDisplay: "narrowSymbol"` so Node ICU versions produce `"$0.000039"` rather than `"US$0.000039"`.
  - `DashboardAiUsageSummaryCard`: pin token-count formatting to `en-US` so the dashboard renders `"1,840"` regardless of system locale.

  Companion test changes (not user-visible): test fixtures pass the test-only env via the deployer's `env` argument, several CLI tests wrap expected paths in `path.resolve(...)` so Windows backslash output matches, `PrismaMigrationDeployer` recovery test moved to its own file (libsql native state from earlier tests in the same file leaked into the recovery flow on Windows), and `vitest.unit.config.ts` switched to the forks pool for libsql native-module isolation across files.

- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [e4d3e1a]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [e4d3e1a]
- Updated dependencies [7b50018]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [e4d3e1a]
- Updated dependencies [0082ab5]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [51b728d]
  - @codemation/host@0.7.0
  - @codemation/core@0.11.0
