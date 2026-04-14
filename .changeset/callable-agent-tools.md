---
"@codemation/core": minor
"@codemation/core-nodes": patch
"@codemation/agent-skills": patch
---

Add inline callable agent tools to the workflow DSL.

This introduces `callableTool(...)` as a workflow-friendly helper for app-local agent tools, keeps
`CallableToolFactory.callableTool(...)` as a compatible factory entry point, teaches `AIAgentNode`
to execute callable tools with the same tracing and validation model as other tool kinds, and
updates docs, skills, and the test-dev sample to show the new path.
