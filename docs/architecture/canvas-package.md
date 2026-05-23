# Canvas package architecture

## Two packages, two roles

| Package                   | Role             | What it contains                                                                                      |
| ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `@codemation/canvas-core` | **Headless**     | Hooks, controllers, presenters, realtime infra, API client, layout engine. No JSX.                    |
| `@codemation/canvas`      | **Default skin** | React components, screens, panels — built on canvas-core. Compat shim re-exports canvas-core symbols. |

## When to use which

**Plugin authors / consumer apps** that want layout control or a custom visual skin: import from `@codemation/canvas-core`. Compose the sub-controllers (`useWorkflowDetailController`, `useWorkflowRunController`, `useWorkflowInspectController`, etc.) and build your own screens on top.

**Consumers that want the default appearance**: mount `WorkflowDetailScreen` from `@codemation/canvas`. Pass slot render props to override individual sections without rebuilding the whole screen.

**next-host**: imports from `@codemation/canvas` (compat shim). No source changes needed — the shim re-exports all canvas-core symbols so existing imports continue to resolve.

## The compat shim

`@codemation/canvas` re-exports `@codemation/canvas-core` via `export * from "@codemation/canvas-core"` at the top of its index. This keeps consumers that imported headless symbols from the old monolithic canvas package working without source changes.

The shim is planned for removal once `@codemation/next-host` is migrated to canvas-core directly. Track that migration before deleting the shim.

## Hard rules

1. **canvas-core must contain no JSX** (`.tsx` files are ESLint errors in that package). All rendering lives in `@codemation/canvas`.
2. **canvas-core must not import from canvas**. The dependency arrow is one-way: canvas → canvas-core.
3. **`WorkflowDetailScreen` is canvas-ui only.** It is not re-exported from canvas-core's index. Next-host reaches it via the compat shim in `@codemation/canvas`.

## Sub-controller public API

| Hook                             | What it owns                            |
| -------------------------------- | --------------------------------------- |
| `useWorkflowDetailController`    | Façade — composes all sub-controllers   |
| `useWorkflowRunController`       | Run selection, realtime, activation     |
| `useWorkflowInspectController`   | Node selection, inspector panel, resize |
| `useWorkflowPinController`       | Pinned outputs                          |
| `useWorkflowJsonEditController`  | JSON editor dialog state                |
| `useWorkflowTestSuiteController` | Test suite tab state                    |

Return types are exported from canvas-core as `WorkflowRunControllerReturn`, `WorkflowInspectControllerReturn`, etc.
