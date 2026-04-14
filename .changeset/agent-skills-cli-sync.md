---
"@codemation/agent-skills": patch
"@codemation/cli": patch
---

Expose the packaged agent skills extractor as an importable module and refresh `.agents/skills/extracted` automatically when running `codemation dev`, `codemation build`, `codemation serve web`, or `codemation dev:plugin`. Add `codemation skills sync` for manual or CI refreshes after upgrading the CLI.
