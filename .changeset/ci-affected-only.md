---
"@codemation/agent-skills": patch
"@codemation/cli": patch
"@codemation/core": patch
"@codemation/core-nodes": patch
"@codemation/core-nodes-gmail": patch
"@codemation/next-host": patch
"create-codemation": patch
---

Add per-package `test:unit` scripts so Turbo can address each package individually for affected-only filtering. No runtime changes — dev-tooling only.
