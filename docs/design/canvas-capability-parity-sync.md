# Canvas capability parity — designer sync

> **What this is**: a working document for the engineering+design conversation about Sprint 9. The new visual design dropped or simplified several canvas capabilities that exist in production today. We need a per-row decision before customer-ui adoption (Sprint 9 Story H) starts.
>
> **How to use it**: walk through the rows together. For each, pick one of: **Re-skin** (keep the capability, redesign visually), **Embed default** (drop in canvas's existing UI inside the new layout), **Defer** (don't ship now, track ticket). Add notes, sign at the bottom.
>
> **Status**: 🟢 ratified 2026-05-18 by chris@maderelevant.com (designer) + engineering. Story H unblocked.
>
> **Default**: per Story I D4, when in doubt prefer **Embed default** — preserves capability via the existing default-skin component inside customer-ui's layout. Re-skin only where the component is small enough that a redesign isn't multi-week. Defer only where v1 cuts are explicitly acceptable.

## Background

The `@codemation/canvas` package today is a 19.5k-LOC library that powers the workflow editor, run viewer, inspector panels, test-suite UI, and real-time updates. Customer-ui's redesign rebuilt much of this with new visual treatments — but several capabilities were missed (probably because they weren't visible in the docs the designer was given).

Sprint 9 splits canvas into a headless core + skinned UI. Customer-ui then composes its own screens using the headless hooks. To do that responsibly we need to know, per capability:

- Is this on by default in customer-ui? (re-skin)
- Or do we embed canvas's existing UI inside the new layout? (embed default)
- Or are we cutting it? (defer with a tracked issue)

There is no "lose it silently" option.

## Sign-off

- [x] Designer: chris@maderelevant.com Date: 2026-05-18
- [x] Engineering: (Codemation framework team) Date: 2026-05-18

---

## 1. Real-time run events

**Today's location**: `WorkflowRealtimeProvider` + `realtime/realtimeClientBridge.ts` + WS bridge to the workspace dev server.

**What it does**: as a workflow run progresses, the UI updates live — nodes change color, new steps appear in the timeline, output payloads stream in. No page refresh.

**Status in new design**: replaced with `useRunDetailQuery` polling. The page is static between polls; users see no movement during the run.

**Why it matters**: long-running workflows (especially AI-heavy ones) look broken without live updates. Users hit refresh, doubt the system works, lose confidence.

**Engineering implications**: we already have the realtime infra. Wiring customer-ui's `RunTimeline` to subscribe is straightforward (~30 LOC). The visual cost is the timeline must handle items appearing mid-render — design needs to confirm the animation/treatment.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [x] Embed default [ ] Defer

**Notes**: Subscribe customer-ui's `RunTimeline` to canvas-core's `WorkflowRealtimeProvider` (Story H D3). Default fade/slide-in transition acceptable for v1; designer can refine later.

---

## 2. Multi-port edges (If / Switch fan-out)

**Today's location**: `WorkflowCanvasStraightCountEdge.tsx`, `WorkflowCanvasSymmetricForkEdge.tsx`.

**What it does**: when an `If` or `Switch` node branches, the outgoing edges show per-port item counts (e.g. "12 items" on the true branch, "3 items" on the false branch), live during runs.

**Status in new design**: `MapView` (customer-ui's mini-canvas) renders no edges at all. The current main canvas wrapper still has them, but the workflows-inventory page lost them.

**Why it matters**: with multi-port nodes, the SHAPE of the graph carries information ("most things flow to the true branch"). Edge-less mini-views are less informative.

**Engineering implications**: bringing edges into `MapView` is non-trivial (it's a custom SVG mini-canvas, not the ReactFlow one). Two options: (a) keep `MapView` edge-less but make the main canvas the default for run viewing; (b) port edge rendering into `MapView`.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [ ] Embed default [x] Defer

**Notes**: v1 keeps `MapView` edge-less; main canvas (which has edges) remains the source for run viewing. Tracked ticket for porting edge rendering into the mini-canvas — pick up when MapView becomes the default workflow inventory thumbnail.

---

## 3. Connection invocations

**Today's location**: surfaced inside `WorkflowExecutionInspector` as distinct rows in the execution tree.

**What it does**: when data flows between nodes (especially across If/Switch branches), each connection has its own invocation row showing item counts, timing, and the data that crossed.

**Status in new design**: `RunDetailPage` filters them out explicitly: `.filter((i) => i.kind === "workflowNodeActivation")`. So users see only node executions, not the data flowing between them.

**Why it matters**: when debugging "why did this workflow do X", users often need to see what flowed between nodes — not just what each node did. Without connection invocations, branching workflows are hard to reason about.

**Engineering implications**: drop the filter; add a row treatment for connection invocations. Design needs to specify visual diff between a node-execution row and a connection row.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [x] Embed default [ ] Defer

**Notes**: Story H D4 already locks this. Drop the filter; render connection invocations with a distinct row visual derived from canvas-ui's existing treatment. **Gated behind `showAdvanced` user pref** — the inspector / connection-invocation rows are collapsed by default for non-tech users; concierge agent fills the diagnostic gap. Power users enable in settings.

---

## 4. Telemetry / trace inspector

**Today's location**: `WorkflowInspectorPrettyView`, `WorkflowInspectorErrorView`, `WorkflowInspectorJsonView`, `NodeInspectorTelemetryPresenter`. A whole inspector with pretty/JSON/binary/error views, attachments, drill-down.

**What it does**: for each step in a run, the user can see the actual input data, output data, errors with stack traces, attached files (binary payloads). Critical for debugging.

**Status in new design**: `RunStep` shows raw `inputJson` / `outputJson` only. No pretty view, no error formatting, no binary view, no drill-down.

**Why it matters**: when something fails, the user needs to understand what data caused it. Raw JSON works for simple types but is hostile for nested structures.

**Engineering implications**: easiest is to embed the existing `WorkflowInspector*View` components inside the new RunStep expansion. Re-skinning means rewriting all four view types — significant design surface.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [x] Embed default [ ] Defer

**Notes**: Embed `WorkflowInspectorPrettyView` / `WorkflowInspectorErrorView` / `WorkflowInspectorJsonView` as expandable sub-sections inside customer-ui's `RunStep`. Re-skinning all four is multi-week; embedding keeps debugging capability intact for v1. **Hidden by default behind `showAdvanced` user pref** — the design philosophy is to keep boomer-friendly users away from JSON / errors / raw data; they use the concierge agent to figure out what went wrong. Power users flip `showAdvanced` in settings to surface the full inspector.

---

## 5. Test-suite UI

**Today's location**: 15 files under `panels/tests/` — cases, assertions, metrics, pass-rate chart, delta badges, detail panel.

**What it does**: lets users define test cases for a workflow, run them, track pass-rate over time, see assertion diffs.

**Status in new design**: customer-ui's tab strip is `Diagram | Runs | Settings | Source code`. **No Tests tab exists.** The capability is completely unreachable in the new design.

**Why it matters**: workflows ARE testable; the test-suite is one of the few things that distinguishes Codemation from "just call an LLM in a loop." Cutting it silently would be a positioning loss.

**Engineering implications**: re-skinning the test-suite is ~weeks of design work. Embedding the default skin in a new tab is ~1 day. Cutting it means users lose this capability until we add it back later.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [x] Embed default [ ] Defer

**Notes**: **Rename the existing "Source code" tab to "Double check"** and embed `panels/tests/*` as-is from canvas-ui there. Reasoning: "Source code" is meaningless to non-tech users; "Double check" tracks the boomer-friendly framing ("did this run correctly?"). The original "Source code" view is deferred — power users can read source via raw file access if they need it. Test-suite content fits the rename naturally because tests are exactly "double-checking the workflow does what it should."

---

## 6. Pinned outputs / pin-override JSON editor

**Today's location**: `togglePinnedOutput`, `editNodeOutput`, `clearPinnedOutput` + `WorkflowJsonEditorDialog`.

**What it does**: when developing a workflow, the user can "pin" a node's output to a specific value so downstream nodes operate on stable data instead of re-fetching every run. Powerful for iterative development.

**Status in new design**: not surfaced anywhere.

**Why it matters**: power users want this; new users don't know it exists. Not surfacing it doesn't break anyone, but it removes a key dev-loop accelerator.

**Engineering implications**: re-skinning the JSON editor dialog is non-trivial; embedding it as-is is cheap. Question is whether the new design has a place to put the "pin" affordance on a node card.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [x] Embed default [ ] Defer

**Notes**: Embed `WorkflowJsonEditorDialog` as-is. Surface a small "Pin output" item in the node card's overflow menu (kebab/`MoreHorizontal`); designer can refine the affordance later. Power-user feature so a slightly hidden entry point is acceptable.

---

## 7. Run-button trigger picker

**Today's location**: `WorkflowCanvasRunButton` + `hooks/useWorkflowCanvasRunButton.ts`.

**What it does**: when a workflow has multiple triggers (e.g. a cron AND a webhook), the run button lets the user pick which to test. Also distinguishes "live trigger" vs "test trigger" semantics.

**Status in new design**: customer-ui has a "Test run" outline button that's currently a no-op.

**Why it matters**: workflows with multiple triggers are common (cron for periodic + webhook for ad-hoc). Without the picker, the user can't easily test specific code paths.

**Engineering implications**: re-skinning is mostly a button + dropdown menu redesign — small. Embedding the default keeps capability, mismatched visual.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [x] Embed default [ ] Defer

**Notes**: Replace the customer-ui no-op "Test run" button with canvas-ui's `WorkflowCanvasRunButton`. Visual mismatch is small (single button); can be re-skinned in a later iteration without losing capability now.

---

## 8. Activation error dialog

**Today's location**: `WorkflowActivationErrorDialog`.

**What it does**: when a user tries to activate a workflow but it can't start (missing credentials, invalid config, etc.), a structured dialog explains why and offers fixes.

**Status in new design**: no equivalent. Users would get a toast or silent failure.

**Why it matters**: this is the "I clicked activate, why didn't it work?" moment. The default dialog explains the failure with specific guidance ("connect Gmail to use this trigger"). Without it, users either give up or contact support.

**Engineering implications**: re-skin is a small dialog redesign. Embedding canvas-ui's dialog inside customer-ui's layout works fine.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [x] Embed default [ ] Defer

**Notes**: Story H D6 already locks this. Embed `WorkflowActivationErrorDialog` content as an `ActivationErrorBanner` inside the customer-ui layout. Keeps structured failure messages + remediation guidance intact.

---

## 9. Credential health badges on nodes

**Today's location**: `credentialAttentionTooltipByNodeId` + `workflowNodeIdsWithBoundCredential` + `ControlPlaneCredentialBindingsRenderer`.

**What it does**: when a workflow node depends on a credential (Gmail, Slack, etc.) and that credential is expired / revoked / failing, a small red badge appears on the node in the canvas. Hovering shows the issue.

**Status in new design**: not surfaced outside the wrapped canvas — the new card-style node rendering doesn't have this affordance.

**Why it matters**: "my workflow stopped working" without any visual hint of WHY is a support-ticket generator. Badges let users self-diagnose.

**Engineering implications**: badge is a small overlay on the new node card. Need design for the visual treatment.

**Decision (ratified 2026-05-18)**: [ ] Re-skin [x] Embed default [ ] Defer

**Notes**: Reuse `credentialAttentionTooltipByNodeId` data source; overlay canvas-ui's existing badge component (red dot + tooltip) on the new node card. Visual treatment can be refined later — the data + interaction stay correct.

---

## 10. Execution-tree auto-follow

**Today's location**: inside `WorkflowExecutionInspector` — collapsible tree with scroll-to-active-node behavior during runs.

**What it does**: as a run progresses, the active node's row scrolls into view in the execution tree. Users don't have to chase the cursor.

**Status in new design**: absent from `RunTimeline`.

**Why it matters**: for runs with many nodes, manually scrolling to find the currently-running node is annoying. Auto-follow keeps focus where it matters.

**Engineering implications**: small JS behavior (`scrollIntoView` on the active row). Easiest if the new `RunTimeline` adopts the same pattern.

**Decision (ratified 2026-05-18)**: [x] Re-skin [ ] Embed default [ ] Defer

**Notes**: Trivial re-implement in customer-ui's `RunTimeline`: `ref.scrollIntoView({ block: "nearest" })` on the active step's row in a `useEffect` keyed on the active node id. No need to embed canvas-ui's tree component.

---

## Decision summary table

Fill this in after individual rows are decided:

Ratified 2026-05-18:

| #   | Capability                  | Re-skin | Embed default | Defer |
| --- | --------------------------- | ------- | ------------- | ----- |
| 1   | Real-time run events        | [ ]     | [x]           | [ ]   |
| 2   | Multi-port edges            | [ ]     | [ ]           | [x]   |
| 3   | Connection invocations      | [ ]     | [x]           | [ ]   |
| 4   | Telemetry / trace inspector | [ ]     | [x]           | [ ]   |
| 5   | Test-suite UI               | [ ]     | [x]           | [ ]   |
| 6   | Pinned outputs editor       | [ ]     | [x]           | [ ]   |
| 7   | Run-button trigger picker   | [ ]     | [x]           | [ ]   |
| 8   | Activation error dialog     | [ ]     | [x]           | [ ]   |
| 9   | Credential health badges    | [ ]     | [x]           | [ ]   |
| 10  | Execution-tree auto-follow  | [x]     | [ ]           | [ ]   |

Totals: **1 Re-skin · 8 Embed default · 1 Defer**.

## What happens after sign-off

- Each "Re-skin" row becomes a sub-task within Sprint 9 Story H (or a new story if it's big).
- Each "Embed default" row becomes a small embed task within Sprint 9 Story H — usually a single `import` from canvas-ui and a small layout placement.
- Each "Defer" row becomes a tracked issue with acceptance criteria for when we revisit.

Until all 10 rows are decided, Story H cannot start.
