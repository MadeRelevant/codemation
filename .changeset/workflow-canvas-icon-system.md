---
"@codemation/core-nodes": patch
"@codemation/next-host": patch
---

Workflow-canvas icon system redesign: LTR-oriented control-flow icons, pixel-perfect Split / Aggregate SVGs, and a single icon renderer shared by the canvas and the execution tree panel.

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
