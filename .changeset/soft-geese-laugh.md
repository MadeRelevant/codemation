---
"@codemation/core": minor
"@codemation/core-nodes": minor
---

Add structured-output schemas to AI agents and choose the safer OpenAI response mode per model snapshot.

This exposes `outputSchema` on agent configs, teaches `AIAgentNode` to validate and repair structured outputs, and
avoids opting older OpenAI snapshots into `json_schema` when only function calling is safe.
