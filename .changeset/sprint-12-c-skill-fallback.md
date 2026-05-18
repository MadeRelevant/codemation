---
"@codemation/agent-skills": patch
---

Sprint 12 Story C: add self-solving fallback chain to `codemation-workflow-dsl` skill.

- Add "When no example matches — the self-solving fallback chain" section after "Discovering nodes and patterns".
- Four-tier chain: retry with intent variations → defineRestNode (HTTP APIs) → HttpRequest (inline one-off) → defineNode (non-HTTP custom logic).
- Explicit "What NOT to do" and "Surfacing what you did" sub-sections.
- Agent never asks the non-technical user for fallback choices; picks per the chain and reports what it used.
