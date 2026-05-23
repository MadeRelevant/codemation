# @codemation/ui

## 0.2.0

### Minor Changes

- 8285ec0: feat(ui): extract @codemation/ui shared package (Sprint 14 Story 10)
  - New `@codemation/ui` package with shadcn primitives (button, badge, collapsible, dialog, dropdown-menu, select, tabs, input, label, switch, textarea), reui/tree widget (Tree, TreeContext, TreeDragLine, TreeItem, TreeItemLabel), composites (CodemationDialog, JsonMonacoEditor), and consolidated StatusPill.
  - Single `cn` tailwind-merge wrapper in `src/lib/cn.ts`.
  - Smoke tests for StatusPill (all 5 status variants + children + className).
  - canvas and next-host migrated to import from `@codemation/ui`; duplicate local component files deleted.

### Patch Changes

- 8285ec0: test(ui): push @codemation/ui coverage to ≥90% (Sprint 16 Story 01 — ui work unit)

  Add smoke tests for all previously uncovered shadcn/Radix primitive wrappers
  (Badge, Button, Input, Label, Switch, Textarea, Collapsible, Tabs, Select,
  Dialog, CodemationDialog, Tree, TreeItem) and configure per-package coverage
  with `all: true` so uncovered files cannot silently inflate the percentage.
  Coverage now at 98.9% lines (93 instrumented lines measured across all source
  files, with documented exclusions for the barrel index, the cn() one-liner, and
  JsonMonacoEditor which requires a real browser canvas/worker environment).

- 8285ec0: Show hover state on select dropdown items (hover:bg-accent hover:text-accent-foreground).
