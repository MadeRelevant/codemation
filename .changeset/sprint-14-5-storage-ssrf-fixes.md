---
"@codemation/host": patch
"@codemation/core-nodes": patch
---

fix(sprint-14.5/storage+ssrf): S3 403-not-as-404 + KIND unknown throw + CGN SSRF block + audit prune interval env (Sprint 14 fix pass)

- `S3BinaryStorage.isNotFoundError`: remove `statusCode === 403` from not-found check; propagate 403 (misconfiguration) instead of silently treating it as missing.
- `AppContainerFactory.createBinaryStorage`: throw `Error` for unknown `BINARY_STORAGE_KIND` values (e.g. `"gcs"`) instead of silently falling back to local storage.
- `WorkflowAuditLogPruneScheduler`: read interval from `CODEMATION_AUDIT_PRUNE_INTERVAL_MS` (dedicated env); fall back to `CODEMATION_RUN_PRUNE_INTERVAL_MS` then static default.
- `SsrfGuard.isPrivateIPv4`: add `100.64.0.0/10` (Carrier-Grade NAT, RFC 6598) to blocked ranges.
