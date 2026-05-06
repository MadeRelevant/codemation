---
"@codemation/core-nodes": patch
---

Test-only: drop a flaky wall-clock parallelism assertion in the AI Agent test suite. Parallel execution is still asserted deterministically via tool start-time deltas — no behaviour change.
