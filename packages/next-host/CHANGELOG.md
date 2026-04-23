# @codemation/next-host

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
