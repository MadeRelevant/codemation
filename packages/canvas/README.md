# @codemation/canvas

The **default skin** for the Codemation workflow canvas: React components, screens, panels, and dialogs built on top of [`@codemation/canvas-core`](../canvas-core). Drop it into a consumer app for a working visual editor + run viewer without writing your own UI.

If you want a fully custom skin, pull `@codemation/canvas-core` directly and compose your own components. If you want to render with the defaults _and_ override a few sections, the screens here accept slot render props — see below.

## Install

```bash
pnpm add @codemation/canvas @codemation/canvas-core
```

(`canvas-core` is a peer dependency. The default skin re-exports its symbols, but it's an explicit dep so version mismatches surface at install time.)

## Where it fits in the framework

```
┌──────────────────────────────────────────────────────────┐
│ Your app  (mounts WorkflowDetailScreen from this package)│
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
                  @codemation/canvas (this package — default skin)
                             │
                             ▼
                  @codemation/canvas-core (headless)
                             │
                             ▼
                  @codemation/host (runtime)
                             │
                             ▼
                  @codemation/core (engine, DSL)
```

## What's inside

### Screens

- `WorkflowDetailScreen` — the workflow editor + run viewer. Mounts the canvas, the inspector, the tab strip (Diagram / Runs / Settings), and the run button. Accepts slot render props on every chrome region.
- Other screens (workflows inventory, run detail, etc.) follow the same pattern.

### Slot render props on `WorkflowDetailScreen`

| Slot                   | Role                               |
| ---------------------- | ---------------------------------- |
| `renderHeader(ctx)`    | Top chrome (title + breadcrumbs)   |
| `renderTabs(ctx)`      | Tab strip                          |
| `renderInspector(ctx)` | Right rail / bottom inspector      |
| `renderLoadingState()` | Loading placeholder                |
| `renderEmptyState()`   | "No workflow selected" placeholder |
| `renderRunButton(ctx)` | Run button                         |

Layout toggles: `hideRunsPaneSidebar`, `hideTabs`. Both default `false`.

Each slot's `ctx` is typed via canvas-core exports (`WorkflowDetailHeaderSlotContext`, `WorkflowDetailInspectorSlotContext`, etc.) — import them when typing your slot render functions.

### Components

- `WorkflowRealtimeProvider` — JSX wrapper around canvas-core's realtime channel. Mount once near the top of the workflow tree.
- Canvas primitives: node cards, edges (straight-count, symmetric-fork), port handles, run button.
- Inspector views: `WorkflowInspectorPrettyView`, `WorkflowInspectorJsonView`, `WorkflowInspectorErrorView`. Useful inside custom screens that want default debugging affordances.
- Test-suite panels: case list, assertions, metrics, pass-rate chart.
- Activation error dialog, JSON editor dialog.

### Compat shim

`@codemation/canvas` re-exports `@codemation/canvas-core` via `export * from "@codemation/canvas-core"`. Existing consumers that imported headless symbols from the monolithic canvas package keep working with no source changes. The shim is planned for removal once `@codemation/next-host` migrates to canvas-core directly — track that migration before relying on the shim long-term.

## Example

```tsx
import { WorkflowDetailScreen } from "@codemation/canvas";
import type { WorkflowDetailInspectorSlotContext } from "@codemation/canvas-core";

function App({ workflowId }) {
  return (
    <WorkflowDetailScreen
      workflowId={workflowId}
      renderInspector={(ctx: WorkflowDetailInspectorSlotContext) => (
        <MyCustomInspector inspect={ctx.inspect} pin={ctx.pin} />
      )}
      hideTabs={false}
    />
  );
}
```

## When to reach past this package

- You want a fundamentally different layout (not just slot overrides) → use `@codemation/canvas-core` directly and compose your own screen.
- You want the headless data flow only (no rendering) → import from `@codemation/canvas-core`.
- You're authoring a plugin that ships UI → depend on this package and stay within the shipped components.

## Hard rules

1. **`WorkflowDetailScreen` lives only here**, not in canvas-core's exports. canvas-core has no UI.
2. **Don't write `.tsx` in canvas-core.** ESLint enforces it. If you need a new headless hook, write it as `.ts` in canvas-core. If you need a new component, write it here.

## See also

- [`docs/architecture/canvas-package.md`](../../docs/architecture/canvas-package.md) — the two-package split rationale, compat-shim phase-out plan
- [`@codemation/canvas-core`](../canvas-core) — the headless layer this package skins
- [`@codemation/host`](../host) — the runtime the screens talk to
