---
"@codemation/canvas-core": minor
"@codemation/canvas": minor
---

Add slot render props and layout toggles to WorkflowDetailScreen (Story G).

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
