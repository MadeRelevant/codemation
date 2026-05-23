---
"@codemation/ui": minor
"@codemation/canvas": patch
"@codemation/next-host": patch
---

feat(ui): extract @codemation/ui shared package (Sprint 14 Story 10)

- New `@codemation/ui` package with shadcn primitives (button, badge, collapsible, dialog, dropdown-menu, select, tabs, input, label, switch, textarea), reui/tree widget (Tree, TreeContext, TreeDragLine, TreeItem, TreeItemLabel), composites (CodemationDialog, JsonMonacoEditor), and consolidated StatusPill.
- Single `cn` tailwind-merge wrapper in `src/lib/cn.ts`.
- Smoke tests for StatusPill (all 5 status variants + children + className).
- canvas and next-host migrated to import from `@codemation/ui`; duplicate local component files deleted.
