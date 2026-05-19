---
"@codemation/host": minor
---

feat(host/audit): workflow audit retention + tier-gated emission (Sprint 14 Story 06)

- WorkflowAuditLogPruneScheduler: deletes WorkflowAuditLog rows older than 90 days (CODEMATION_AUDIT_WORKFLOW_RETENTION_SECONDS override)
- TelemetryRetentionTimestampFactory: hard-coded defaults (span 7d, artifact 3d, metric 30d) so telemetry retention works out-of-box with no env vars required
