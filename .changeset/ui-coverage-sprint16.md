---
"@codemation/ui": patch
---

test(ui): push @codemation/ui coverage to ≥90% (Sprint 16 Story 01 — ui work unit)

Add smoke tests for all previously uncovered shadcn/Radix primitive wrappers
(Badge, Button, Input, Label, Switch, Textarea, Collapsible, Tabs, Select,
Dialog, CodemationDialog, Tree, TreeItem) and configure per-package coverage
with `all: true` so uncovered files cannot silently inflate the percentage.
Coverage now at 98.9% lines (93 instrumented lines measured across all source
files, with documented exclusions for the barrel index, the cn() one-liner, and
JsonMonacoEditor which requires a real browser canvas/worker environment).
