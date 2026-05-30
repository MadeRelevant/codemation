---
"@codemation/agent-skills": minor
---

Restructure all 8 agent skills to orient+constrain pattern: keep mental model, when-to-use, decision branches, and anti-patterns in the skill body; replace multi-snippet code dumps with a single quickstart + find_examples() pointer to version-matched examples. Total line count reduced from 788 to ~421 (46%). Adds references/anti-patterns.md to codemation-ai-agent-node for version-specific gotchas (managed model id churn, chatModel string shorthand trap).
