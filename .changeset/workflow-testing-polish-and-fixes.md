---
"@codemation/core": patch
"@codemation/host": patch
"@codemation/next-host": patch
---

Workflow Testing UI polish and end-to-end correctness fixes.

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
