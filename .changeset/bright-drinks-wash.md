---
"@codemation/core-nodes": minor
"@codemation/agent-skills": patch
---

Normalize fluent workflow DSL callback helpers around the runtime item contract.

`.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` now receive `(item, ctx)` so workflow authors can use `item.json` consistently and read prior completed outputs through `ctx.data` without dropping down to direct node configs.
