---
"@codemation/core": patch
"@codemation/host": minor
---

Decouple telemetry retention from run deletion and move node-specific measurements onto metric points.

- allow telemetry spans, artifacts, and metrics to outlive raw run state through explicit retention timestamps
- narrow telemetry spans to canonical span fields and persist extensible node-specific measurements as metric points
- update telemetry queries, docs, and regression coverage around real workflow execution plus agent/tool observability
