---
"@codemation/canvas-core": patch
---

Pack agent attachment children side-by-side on the canvas instead of stacking them vertically when the compound has two children (LLM + tool / MCP). The previous root/nested aspect ratios (2.6 / 2.0) were tight enough that ELK's box algorithm picked a vertical stack for the common LLM-plus-one-tool shape — visible in the Sprint 2 gmail-agent-smoke workflow where the Gmail MCP attachment landed below OpenAI instead of beside it. Raised to 6.0 / 4.0, which lets two attachments sit in a single readable row matching the LLM/TOOLS chip slots on the parent card.
