---
"@codemation/canvas-core": minor
"@codemation/canvas": patch
---

feat(canvas): extract @codemation/canvas-core headless package (Story E)

Splits `@codemation/canvas` into two packages:

- `@codemation/canvas-core` (new) — headless layer: data hooks (`useWorkflowDetailController`,
  `useWorkflowsQuery`, etc.), realtime infrastructure, ELK layout engine, types, and contexts.
  Zero React component exports; `.tsx` files banned by ESLint.
- `@codemation/canvas` — becomes a compat shim that re-exports everything from `canvas-core`
  plus keeps its own UI components (screens, panels, canvas graph renderer).

Existing consumers (`@codemation/next-host`, `@platform/customer-ui`) compile with zero source
changes thanks to the wide `export *` compat shim.
