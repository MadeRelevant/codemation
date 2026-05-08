---
"@codemation/core": minor
"@codemation/host": minor
"@codemation/next-host": minor
---

Adds an `inspectorSummary` hook on node configs (and `defineNode({ inspectorSummary })` for plugin-author nodes). Returns 2–6 short label/value pairs that describe what the node will do at design time — model + prompt for an agent, method + URL for an HTTP call, schedule + timezone for a cron, etc. Surfaced in the workflow editor's node-properties panel as a new "Configuration" section that renders before any run telemetry exists. Hidden when no rows are produced; node configs that don't implement the hook contribute nothing. Built-in nodes will fill these in across follow-up PRs.
