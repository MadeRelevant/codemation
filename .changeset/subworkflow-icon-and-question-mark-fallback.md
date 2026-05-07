---
"@codemation/core-nodes": patch
"@codemation/next-host": patch
---

`SubWorkflow` nodes now render with the Lucide `workflow` glyph by default, so they read at a glance on the canvas. Nodes that don't set an explicit `icon` (and have no semantic role like agent / model / tool) now fall back to a question-mark glyph instead of `Boxes` — a clearer "missing icon" signal for plugin authors. Unknown icon tokens (`builtin:`, `si:`, `lucide:` lookups that don't resolve) also fall back to the same question-mark glyph for consistency.
