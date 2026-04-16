---
"@codemation/core": patch
"@codemation/core-nodes": patch
"@codemation/next-host": patch
---

Repair malformed AI tool calls inside the agent loop instead of replaying the whole agent node, and surface clearer debugging details when recovery succeeds or is exhausted.

- classify repairable validation failures separately from non-repairable tool errors and preserve stable invocation correlation for failed calls
- persist structured validation details and expose them in next-host inspector fallbacks, timelines, and error views
- add regression coverage for repaired tool calls, exhaustion behavior, and mixed parallel tool rounds
