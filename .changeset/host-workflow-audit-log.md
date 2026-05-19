---
"@codemation/host": minor
---

feat(host/audit): RunEvent-driven WorkflowAuditLog persistence (Sprint 13 Story B)

Adds a workspace-local audit trail that captures run-events as queryable rows.

- `WorkflowAuditLog` Prisma model with indexes on `(actor_user_id, occurred_at)` and `(workflow_id, occurred_at)`
- `WorkflowAuditLogWriter` subscribes to `RunEventBus` and persists `nodeCompleted`, `nodeFailed`, `runSaved` (terminal), and `connectionInvocationStarted` events
- `PrismaWorkflowAuditLogRepository` implements `IWorkflowAuditEmitter` using the workspace Prisma client
- Emission is best-effort: errors are logged and swallowed so workflow execution is never blocked
- Only active when `persistence.kind !== "none"`
