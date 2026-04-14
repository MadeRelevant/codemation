---
"@codemation/core-nodes": minor
"@codemation/agent-skills": patch
---

Unify `workflow().agent()` message authoring with `AIAgent`.

`WorkflowAgentOptions` now takes `messages` (the same `AgentMessageConfig` as `AIAgent`) instead of
`prompt`. The workflow helper passes `messages` through unchanged. Docs, workflow DSL skills, and the
test-dev sample use `itemValue(...)` for per-item prompts; execution docs note `itemValue` on agent
`messages`.
