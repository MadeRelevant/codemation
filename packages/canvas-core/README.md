# @codemation/canvas-core

Headless building blocks for the Codemation workflow canvas: hooks, controllers, realtime infrastructure, API client, and layout engine. **No JSX.**

If you want the default appearance, you probably want [`@codemation/canvas`](../canvas) — it's built on top of this package and re-exports everything you'd import here. Reach for `canvas-core` directly when you want a fully custom visual skin or layout shell.

## Install

```bash
pnpm add @codemation/canvas-core
```

## Where it fits in the framework

```
┌──────────────────────────────────────────────────────────┐
│ Your app                                                 │
│   (Next.js consumer / custom skin / next-host shell)     │
└────────────────────────────┬─────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   @codemation/canvas-core      @codemation/canvas (default skin)
   (headless: this package)     (React components on top)
              │                             │
              └──────────────┬──────────────┘
                             ▼
                  @codemation/host (runtime)
                             │
                             ▼
                  @codemation/core (engine, DSL)
```

`canvas-core` knows how to read a workflow definition, drive its runtime state, lay out the graph, and subscribe to live updates. It does not know how to render anything to the screen — that's a deliberate split.

## What's inside

### Controllers (composable hooks)

| Hook                             | Role                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `useWorkflowDetailController`    | Façade composing all sub-controllers — use this for a one-call setup, or compose the ones below for finer control |
| `useWorkflowRunController`       | Run selection, realtime, activation                                                                               |
| `useWorkflowInspectController`   | Node selection, inspector state, resize                                                                           |
| `useWorkflowPinController`       | Pinned outputs                                                                                                    |
| `useWorkflowJsonEditController`  | JSON editor dialog state                                                                                          |
| `useWorkflowTestSuiteController` | Test-suite tab state                                                                                              |

Each sub-controller exports a typed return interface (`WorkflowRunControllerReturn`, `WorkflowInspectControllerReturn`, etc.) so consumers can pass slices around without untyped tuples.

### Layout

`layoutWorkflow()` runs an ELK-powered orthogonal layout over a workflow's nodes + edges, including support for compound nodes (e.g. nested agents). The resolvers handle declared output ports, edge geometry, label sizing, and per-port edge counts.

### Realtime

`WorkflowRealtimeProvider` (the JSX wrapper lives in `@codemation/canvas`) plus the hooks under `realtime/` give you live run updates from a host-side WebSocket bridge. Subscribe with `useWorkflowRealtimeSubscription(workflowId)` and the controllers above hydrate from the stream.

### API client

`WorkflowCanvasApiClient` is the typed HTTP client for the host's canvas endpoints (workflow list, run history, activation, pin mutations). Inject your own implementation if you target a different host.

## Hard rules

1. **No JSX in canvas-core.** ESLint enforces it — `.tsx` files are rejected. All rendering belongs in `@codemation/canvas` or your own skin.
2. **canvas-core never imports from canvas.** Dependency arrow is one-way.

## Example

```tsx
import { useWorkflowRunController, useWorkflowInspectController } from "@codemation/canvas-core";

function MyCustomRunDetail({ workflowId, runId }) {
  const run = useWorkflowRunController({ workflowId, runId });
  const inspect = useWorkflowInspectController({ workflowId });

  // Render your own UI with run.steps, inspect.selectedNode, etc.
  return <YourCustomLayout run={run} inspect={inspect} />;
}
```

## See also

- [`docs/architecture/canvas-package.md`](../../docs/architecture/canvas-package.md) — the two-package split, the compat shim, when to pick which
- [`@codemation/canvas`](../canvas) — default-skin React components built on this package
- [`@codemation/host`](../host) — the runtime the controllers talk to
