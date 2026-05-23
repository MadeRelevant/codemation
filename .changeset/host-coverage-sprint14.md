---
"@codemation/host": patch
---

test(host): increase unit test coverage to ≥90% (Sprint 14 Story 13)

Adds 30+ new unit test files and extensions covering previously untested logic in
`@codemation/host`. New test suites include:

- `InMemoryCredentialStore` — full CRUD + OAuth2 state/material lifecycle
- `CredentialSessionServiceImpl` — getSession, createSessionForInstance, evict\*
- `SetPinnedNodeInputCommandHandler` — 404/403/decode/null-items paths
- `ReplaceMutableRunWorkflowSnapshotCommandHandler` — 400/404/403/success
- `ReplayWorkflowNodeCommandHandler` — 404/403/workflow-not-found/decode/mode
- `GetWorkflowRunDetailQueryHandler` — undefined detail, empty rollups, cost join
- `WorkflowRunRetentionPruneScheduler` (extended) — both-disabled early return, listRuns fallback, binary storage key fallback, artifact storage key deletion
- `WorkflowAuditLogPruneScheduler` — disabled, custom retention, delete path
- `ManagedCorsMiddleware` — preflight allow/deny, non-preflight with/without CORS headers
- `InMemoryDomainEventBus` — publish routing, metadata error, empty handlers
- `WorkflowRunRepository` wrapper — load/save/listRuns/deleteRun with URL decoding
- `ApiPaths` — all static path methods
- `CodemationConfigNormalizer` — register callback, managed-mode constraints, DefinedCollection unwrapping
- `LocalFilesystemBinaryStorage` — write/read/stat/delete/deleteMany/listByPrefix/path-escape
- `StoredTelemetrySpanScope` (extended) — addSpanEvent, attachArtifact no-op path, asNodeTelemetry view
- `TelemetryQueryService` (extended) — empty-spans early returns, cachedInputTokens/reasoningTokens branches

Coverage exclusions added for infrastructure-only files that require live
connections (SQLite, S3, module loader, internal HMAC wiring).
