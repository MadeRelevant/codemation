---
"@codemation/agent-skills": minor
---

Restructure all 8 agent skills to orient+constrain pattern: keep mental model, when-to-use, decision branches, and anti-patterns in the skill body; replace multi-snippet code dumps with a single quickstart + find_examples() pointer to version-matched examples. Total line count reduced from 788 to ~421 (46%). Adds references/anti-patterns.md to codemation-ai-agent-node for version-specific gotchas (managed model id churn, chatModel string shorthand trap).

Product-owner steering applied (PR #180): plugin-development SKILL.md slimmed with managed-mode non-relevance note; plugin anatomy + full definePlugin code moved to references/plugin-anatomy.md. mcp-capabilities adds managed CP-loaded discovery path and non-managed plugin note. ai-agent-node reframes CodemationChatModelConfig as the managed default (LLM broker auto-authenticates via HMAC pairing; no API key needed) and steers away from BYOK for managed users. credential-development adds conceptual test() explanation (what it does, when called, return shape) with pointer to new defineCredential example.
