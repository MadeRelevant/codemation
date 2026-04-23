---
"@codemation/next-host": patch
---

Migrate the workflow canvas to an ELK-based auto-layout pipeline so complex workflows—especially AI agent hierarchies and parallel `if` / `switch` branches—lay out reliably without manual node repositioning.

Users cannot move nodes around on the canvas, so the framework must place them well by default. The previous Dagre-backed pipeline produced overlap, asymmetric branches, and "orphaned" LLM / tool connections on nested agents.

**What changed**

- **Engine**: replaced Dagre + bespoke overlap resolver with ELK (`elkjs`). Root graph uses ELK Layered (`elk.layered.layering.strategy: LONGEST_PATH`, `elk.layered.nodePlacement.strategy: BRANDES_KOEPF` with `fixedAlignment: BALANCED`) so parallel branches distribute symmetrically around the fork axis and terminal nodes align before merges. Agent compounds use ELK Box with role-aware aspect ratios (root compound 2.6, nested compound 2.0) so nested 1-LLM + 1-tool agents lay out side-by-side.
- **Agent attachments**: two fixed, card-anchored source handles (`attachment-source-llm` at 30%, `attachment-source-tools` at 70%) on the bottom edge of every agent card, matched by LLM / TOOLS chips at the same percentages. Attachment edges render as bezier (React Flow `default`) so overlapping LLM + single-tool fan-outs each take their own arc instead of collapsing onto a shared horizontal segment.
- **Spacing**: reduced default node-node (56 → 45 px) and between-layer (224 → 180 px) spacing by ~20% based on visual tuning.
- **Deleted**: `WorkflowCanvasOverlapResolver` (and its tests) — the ELK pipeline places nodes without post-hoc overlap correction.
- **Added**: `useAsyncWorkflowLayout` hook, `WorkflowElkGraphBuilder` / `WorkflowElkResultMapper`, and a shared `LayoutWorkflowTestKit` harness under `test/canvas/testkit/` that runs the real layout path with in-memory boilerplate.
- **Pinned behaviour**: `test/canvas/layoutWorkflow.renderingRules.test.ts` groups 11 tests across 5 describe blocks (parallel branch merge alignment, symmetric fork placement, agent attachment edges, agent card dimensions, nested agent child packing), asserting on relative deltas rather than hardcoded pixel values.

Dependency: adds `elkjs` to `@codemation/next-host`.
