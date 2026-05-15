---
"@codemation/agent-skills": patch
---

Fix workflow-dsl skill docs: `workflow("id")` is manual-trigger only. Cron, webhook, and other non-manual triggers must use `createWorkflowBuilder({id, name}).trigger(new XxxTrigger(...))` and chain with `.then(new SomeNodeConfig(...))` — the fluent `.map`/`.if`/`.agent`/`.node` sugar is only available via `manualTrigger(...)`.

Affected: `codemation-workflow-dsl/SKILL.md`, `codemation-workflow-dsl/references/builder-patterns.md`, `codemation-workflow-dsl/references/complete-example.md`, `codemation-mcp-capabilities/references/agent-with-mcp.ts`.
