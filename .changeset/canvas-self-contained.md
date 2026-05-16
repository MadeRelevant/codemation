---
"@codemation/canvas": minor
---

Make canvas self-contained: internalize all @/ UI primitives (button, badge, collapsible, dialog, dropdown-menu, input, label, select, switch, tabs, textarea, JsonMonacoEditor, CodemationDialog, reui/tree) so consumers no longer need to provide @/* aliases. Add renderWorkflowJsonEditor config slot for consumers who need a custom editor dialog.
