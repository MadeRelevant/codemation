# @codemation/canvas

## 0.1.3

### Patch Changes

- Updated dependencies [[`6efde7a`](https://github.com/MadeRelevant/codemation/commit/6efde7aa045050cd2fbd22015f7608c513a6f79f)]:
  - @codemation/host@0.9.1
  - @codemation/canvas-core@0.2.1

## 0.1.2

### Patch Changes

- [#167](https://github.com/MadeRelevant/codemation/pull/167) [`3044474`](https://github.com/MadeRelevant/codemation/commit/3044474495525490735510ff74500b53761284b6) Thanks [@cblokland90](https://github.com/cblokland90)! - feat(hitl): Human-in-the-Loop — engine suspend/resume, inbox approval node + channels (local + control-plane), agent-as-tool, decision/timeout handling, inbox decision UX (toast + node status icons + "waiting for approval"), plus the consolidated dev/canvas/host fixes shipped alongside.

- Updated dependencies [[`01f6b48`](https://github.com/MadeRelevant/codemation/commit/01f6b489870b8d73aaba28222ab56700a4582e31), [`0b3d2a3`](https://github.com/MadeRelevant/codemation/commit/0b3d2a3dc379c0d8a6509ae97e47f6bb880caea3), [`3044474`](https://github.com/MadeRelevant/codemation/commit/3044474495525490735510ff74500b53761284b6), [`0b3d2a3`](https://github.com/MadeRelevant/codemation/commit/0b3d2a3dc379c0d8a6509ae97e47f6bb880caea3)]:
  - @codemation/canvas-core@0.2.0
  - @codemation/host@0.9.0
  - @codemation/core@0.12.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`e0933eb`](https://github.com/MadeRelevant/codemation/commit/e0933ebc51806a9593f94758860c591b8346a7a5), [`150e4f0`](https://github.com/MadeRelevant/codemation/commit/150e4f0252efe79141dec86f922af25b51197aa1), [`a70e182`](https://github.com/MadeRelevant/codemation/commit/a70e182a852026e4f6d8f317fe9862417dc23ce6), [`5315e23`](https://github.com/MadeRelevant/codemation/commit/5315e2361492560601ac2c97491aa58c49346fd4), [`ac860a5`](https://github.com/MadeRelevant/codemation/commit/ac860a5af1df3e5766581e644fef8cc0d1b24eba), [`8ac207a`](https://github.com/MadeRelevant/codemation/commit/8ac207ab263542e46fad0b9e1ea584fbb71a747c), [`3025b86`](https://github.com/MadeRelevant/codemation/commit/3025b8685b0d7ad60c506b5a0f21967e681a25ea)]:
  - @codemation/core@0.11.1
  - @codemation/canvas-core@0.1.2
  - @codemation/host@0.8.0

## 0.1.0

### Minor Changes

- 8285ec0: **Breaking (canvas):** `WorkflowCanvasConfig` gains a `renderCredentialBindings` slot. The canvas no longer imports from `@codemation/next-host`; the credential UI is a consumer responsibility.

  **Migration:** Add `renderCredentialBindings` to your `WorkflowCanvasConfig`. Use `NextHostCredentialBindingsRenderer` from `@codemation/next-host/src/features/workflows/canvas-adapter/NextHostCredentialBindingsRenderer` to preserve the existing dropdown + create/edit dialog behavior. See `WorkflowDetailScreenPage.tsx` in next-host for an example.

  If `renderCredentialBindings` is omitted, a small "Credential UI not configured" notice is shown in the inspector panel.

- 8285ec0: Add `createWorkflowCanvasApiClient` factory to `@codemation/canvas`.

  The factory creates a `WorkflowCanvasApiClient` that talks directly to a
  workspace's HTTP API with configurable `apiBase` and `getToken`. Key behaviours:
  - When `getToken` returns `null`, no `Authorization` header is sent and
    cookie/credentials auth is preserved (self-hosted mode).
  - On HTTP 401, the client calls `getToken({ forceRefresh: true })` once and
    retries. After a second 401, the error is surfaced normally.

  `WorkflowRealtimeProvider` and `useWorkflowRealtimeInfrastructure` gain an
  optional `getWsToken` prop. When supplied, the JWT is appended as `?token=` on
  the WebSocket URL. On close-code `4401` (token expired), the hook calls
  `getWsToken({ forceRefresh: true })` and reconnects with exponential backoff
  capped at 30 s.

  `next-host` now wires the canvas using `createWorkflowCanvasApiClient` with
  `apiBase: ""` and `getToken: () => null`, preserving current same-origin
  cookie behaviour unchanged.

- fc5f9b7: Initial release of @codemation/canvas — standalone, pluggable workflow canvas package
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

- 8285ec0: Make canvas self-contained: internalize all @/ UI primitives (button, badge, collapsible, dialog, dropdown-menu, input, label, select, switch, tabs, textarea, JsonMonacoEditor, CodemationDialog, reui/tree) so consumers no longer need to provide @/\* aliases. Add renderWorkflowJsonEditor config slot for consumers who need a custom editor dialog.
- 8285ec0: `WorkflowRealtimeProvider` now accepts an optional `skipDevHealthCheck` prop. When true, the provider initialises `workflowSocketEnabled=true` and skips the `/api/dev/health` polling effect — useful for consumers that already verified the host is reachable (e.g. control-plane's customer-ui after meta-fetch + token-mint). Avoids a one-tick delay before the first workflow-room subscription is sent.

  Also promotes the `sent/queued subscribe for workflow ...` log from `debug` to `info` so DevTools shows the subscription send event, not just the server's `subscribed` ACK.

### Patch Changes

- 8285ec0: Add a `statusLabel` field to `ConnectionInvocationRecord` / `ConnectionInvocationAppendArgs` so connection invocations can carry a short human-readable description of what they are doing (e.g. `"calling search_messages"`). The engine-side `NodeRunStateWriter` persists it; the canvas-side mirror picks it up via the standard patch projection.

  Wire per-MCP-tool-call lifecycle invocations through `AgentMcpIntegration`. `prepareMcpTools` now accepts an optional `appendMcpInvocation` callback (plus the agent activation / iteration / item / parent-invocation context). When the host-side `AgentMcpIntegrationImpl` wraps a tool's `execute`, it emits a `running` record with `statusLabel: "calling <toolName>"` and a matching `completed` or `failed` record; the existing telemetry span and 403 `NeedsReconsentEvent` paths are preserved. `@codemation/canvas-core` exposes a `CurrentStatusLabelSelector` and `WorkflowCanvasNodeData.currentStatusLabel`; `@codemation/canvas` renders the latest non-empty label as a sub-line under the node card. The two capabilities work together: MCP tool calls under an agent now stream the same invocation events the LLM and node-backed tool paths already emit, and the canvas surfaces the running label per-node.

- 8285ec0: feat(canvas): extract @codemation/canvas-core headless package (Story E)

  Splits `@codemation/canvas` into two packages:
  - `@codemation/canvas-core` (new) — headless layer: data hooks (`useWorkflowDetailController`,
    `useWorkflowsQuery`, etc.), realtime infrastructure, ELK layout engine, types, and contexts.
    Zero React component exports; `.tsx` files banned by ESLint.
  - `@codemation/canvas` — becomes a compat shim that re-exports everything from `canvas-core`
    plus keeps its own UI components (screens, panels, canvas graph renderer).

  Existing consumers (`@codemation/next-host`, `@platform/customer-ui`) compile with zero source
  changes thanks to the wide `export *` compat shim.

- 8285ec0: feat(canvas): topological status cap — mask premature fan-in completion in canvas rendering

  Adds `WorkflowCanvasTopologicalStatusCap` which ensures the canvas never displays a node as more progressed than its slowest sequential upstream. In fan-out/fan-in patterns (e.g. `.if()` emitting to both a branch and a downstream merge node simultaneously), the merge node now stays in `running` state visually until all branch predecessors reach a terminal state. Engine truth is untouched; this is a pure visualization projection applied in the patch planner and the seed effect.

- 8285ec0: test(canvas): push @codemation/canvas coverage to ≥90% lines (Sprint 16 Story 01)

  Added 241 new behavioral tests across 37 new test files covering panels, canvas components, and screens. Added coverage.all + include/exclude configuration to vitest.ui.config.ts with documented exclusions for ReactFlow-dependent files (WorkflowCanvas, CodemationNode handles), Monaco Editor (WorkflowJsonEditorDialog), WebSocket provider, and CSS fetch components.

- 8285ec0: Hide the canvas run button overlay while the tests view is active.
- 8285ec0: Fix workflow detail screen hydration mismatch caused by overlay siblings (tabs, run button, error banner, realtime badge) being rendered conditionally on controller state that diverges between SSR and a warm React Query client cache. Overlay siblings are now gated behind the same `hasMounted` flag as the canvas root.

  Render AIAgent MCP-server attachments in the canvas. `WorkflowDefinitionMapper` (the server-side mapper that feeds `/api/workflows/:id`) now passes an `McpServerResolver` backed by the host's `McpServerCatalog` to `AgentConnectionNodeCollector.collect`, so virtual connection nodes for declared `mcpServers` are emitted alongside the LLM and tool children. The MCP descriptor itself carries `icon: "lucide:plug"` and `lucide:plug` is added to the curated `WorkflowCanvasLucideIconRegistry` so MCP servers render with a distinct icon on the synchronous zero-HTTP path.

- 8285ec0: Close the node properties panel when clicking the canvas background (pane click).
- 8285ec0: test(canvas): pure-logic unit tests for presenters + hooks (Sprint 14 coverage)

  Add table-driven unit tests for WorkflowInspectorPrettyTreePresenter, WorkflowCanvasRunButton,
  TestSuiteRunMetricsComparison, MetricSelector, WorkflowRunsList, workflowDetailScreenRealtimeBadge,
  useWorkflowDetailScreenThemeStyle, WorkflowInspectorErrorView, WorkflowInspectorAttachmentGroupingPresenter,
  TestSuiteCaseStatusIcon, and useLocalNavigation, covering all pure-logic branches and interactive paths.

- 8285ec0: Add `aria-hidden` and `react-remove-scroll` as direct dependencies. Canvas's dist references these (transitively pulled in via Radix UI Dialog primitives used by next-host source files that canvas's tsconfig `@/*` path alias cherry-picks). Without these declared, consumers fail with `Module not found` when the canvas dist is bundled into a Next.js client bundle.

  This is a tactical fix; the architectural cleanup is to stop canvas's tsconfig from aliasing `@/*` to `../next-host/src/*`. Tracked as a follow-up.

- 8285ec0: fix(canvas): surface workflow run error in detail screen as inline banner

  Replace the WorkflowActivationErrorDialog modal (which was never triggered
  for run errors) with an inline alert banner mounted in the top-right floating
  overlay alongside the realtime badge. The banner shows when
  controller.runErrorAlertLines is non-null, includes a dismiss button, and
  clears on the next run attempt. This surfaces unbound-credential and other
  run errors (previously swallowed in the UI) without blocking the canvas.

- 8285ec0: fix(canvas): tests panel button releases after canvas-triggered run

  Replace startMutation.isPending (unstable per React Query render) with a
  local isStartPending flag set before mutateAsync and cleared in .finally().
  This fixes the button being stuck in "Running..." after a canvas play-dropdown
  triggered test run completes.

- 8285ec0: Stop leaking `node:crypto` and `node:module` into canvas's browser bundle. `NodeIterationIdFactory` and `ConnectionInvocationIdFactory` now use `globalThis.crypto.randomUUID()` instead of importing `randomUUID` from `node:crypto`. Canvas's `tsdown` build is configured with `platform: "neutral"` so the dist no longer ships `createRequire(import.meta.url)` from `node:module`. Fixes consumer Turbopack OOMs when the canvas dist is included in a Next.js client bundle.
- 8285ec0: Fix three browser-visible regressions on the workflow detail / canvas screen (Sprint 13 Story G).

  **Bug 1 — Hydration mismatch on canvas mount:** `WorkflowDetailScreen` now gates canvas rendering behind a `hasMounted` effect so the server and first client render both produce the loading placeholder. Previously a warm React Query cache could cause the client to render `WorkflowCanvas` while the server rendered `DefaultLoadingState`, producing a React hydration error.

  **Bug 2 — clock.svg 404:** `WorkflowCanvasLucideIconRegistry` now includes the `Clock` icon from `lucide-react`. Previously `CronTrigger`'s `lucide:clock` icon fell through to the remote-glyph path, which issued a redundant HTTP request to `/api/lucide-icon/clock.svg` (the route works, but the curated registry is the zero-HTTP fast path).

  **Bug 3 — MCP attachment node invisible/unselectable:** `PersistedWorkflowSnapshotMapper.toTopLevelNodes` no longer early-returns when all connection-slot children are already materialized. The previous early return skipped `toAttachmentNodes()` — the only code path that emits MCP attachment nodes — because `allConnectionChildrenMaterialized` only examined `snapshot.connections` (tool/LLM wiring), not `config.mcpServers`. MCP nodes are now always emitted and are visible and clickable on the canvas.

- 8285ec0: test(ui): UI security tests + test-suite orchestration (Sprint 13 Story G)
  - Fix `tooling/vitest/ui.config.ts` to include `next-host`, `canvas`, and `canvas-core` UI test suites — previously only `host` was wired.
  - Add `packages/canvas/test/bundleBoundary.test.ts` and `packages/canvas-core/test/bundleBoundary.test.ts`: static import-graph walk asserting no server-only imports leak into browser bundles.
  - Add `packages/next-host/test/features/users/UsersInviteDialog.test.tsx`: RHF + Zod email validation (valid submit, invalid email, empty email, server error).
  - Add `packages/next-host/test/features/invite/InviteAcceptScreen.test.tsx`: verify-state gate, password mismatch, password length, and successful activation.
  - Add `packages/canvas/test/screens/WorkflowDetailScreen.renderWorkflowJsonEditor.test.tsx`: slot override contract (no override / with override / updated context).
  - Add `packages/canvas/test/screens/WorkflowDetailScreen.fullMount.smoke.test.tsx`: full-mount smoke confirming slot wiring in the real component.
  - Add `packages/next-host/vitest.ui.config.ts`: jsdom-only config scoped to `*.test.tsx` for the UI suite.

- 8285ec0: Remove the `development` export condition from `@codemation/canvas`, `@codemation/core`, and `@codemation/host` package.json exports. Module resolution now consistently uses the built `dist/` regardless of `NODE_ENV`.

  **Why:** the `development` condition is auto-applied by bundlers (Next.js dev mode, Vite dev, etc.) and was making every cross-repo monorepo consumer fall through to TypeScript source. For the framework's own `@codemation/next-host`, this was fine — turbo's `dev` already runs `tsdown --watch` on these packages so dist is always fresh in dev. For external consumers (notably the managed control plane), it caused multi-hundred-file recursive source compiles on every cold page load.

  **Impact:** zero behavior change for normal users (they consume published `dist/`). Framework monorepo devs editing canvas/core/host source still see live updates as long as `tsdown --watch` is running for the package — which is what `pnpm dev` (turbo) orchestrates by default. If you're running an app in isolation without the package's watch task, you now need to start it explicitly.

- 8285ec0: feat(ui): extract @codemation/ui shared package (Sprint 14 Story 10)
  - New `@codemation/ui` package with shadcn primitives (button, badge, collapsible, dialog, dropdown-menu, select, tabs, input, label, switch, textarea), reui/tree widget (Tree, TreeContext, TreeDragLine, TreeItem, TreeItemLabel), composites (CodemationDialog, JsonMonacoEditor), and consolidated StatusPill.
  - Single `cn` tailwind-merge wrapper in `src/lib/cn.ts`.
  - Smoke tests for StatusPill (all 5 status variants + children + className).
  - canvas and next-host migrated to import from `@codemation/ui`; duplicate local component files deleted.

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
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [51b728d]
  - @codemation/host@0.7.0
  - @codemation/canvas-core@0.1.0
  - @codemation/core@0.11.0
  - @codemation/ui@0.2.0
