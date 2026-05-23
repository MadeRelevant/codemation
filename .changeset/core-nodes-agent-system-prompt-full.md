---
"@codemation/core-nodes": patch
---

feat(core-nodes): pass full system prompt to inspector summary without 80-char truncation

The AIAgent inspector summary now includes the complete system prompt text.
Previously it was truncated at 80 characters, hiding most of the prompt.
The canvas properties panel can render it collapsible with markdown formatting.
