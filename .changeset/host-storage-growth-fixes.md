---
"@codemation/host": patch
---

feat(host/storage): artifact-to-object-storage + Run snapshot dedup (Sprint 14 Story 07)

- TelemetryArtifact payloads > 64 KB are now offloaded to BinaryStorage (payloadStorageKey column)
  instead of stored inline in Postgres TEXT columns. Expired artifacts with storage keys have their
  BinaryStorage blobs deleted during prune.
- Run snapshot deduplication: new WorkflowSnapshot table keyed by (workflowId, snapshotHash).
  PrismaWorkflowRunRepository.createRun/save call findOrCreate to share identical snapshot JSON
  across runs instead of storing redundant copies per run.
- Schema migrations added for both PostgreSQL and SQLite (with backfill of existing rows).
