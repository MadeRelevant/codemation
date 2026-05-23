# Audit Trail

Codemation captures two distinct audit trails — one at the control-plane (CP) level and one at the workspace level. Both are append-only, relational, and queryable by actor and time.

## Control-plane audit — `AdminAuditLog`

Every CQRS command executed by the CP (create workspace, rotate pairing secret, add LLM model, etc.) produces a row in the `AdminAuditLog` table via `AuditingCommandBusDecorator`. The decorator wraps the inner command bus; both successes and failures are recorded.

**Schema** (CP DB):

| Column             | Type      | Description                                 |
| ------------------ | --------- | ------------------------------------------- |
| `id`               | UUID      | Unique row id                               |
| `occurred_at`      | TIMESTAMP | When the command executed                   |
| `actor_user_id`    | TEXT      | The user who dispatched the command         |
| `actor_session_id` | TEXT?     | The session (where available)               |
| `action`           | TEXT      | e.g. `workspace.create`, `mcpServer.update` |
| `resource_type`    | TEXT      | e.g. `workspace`, `mcpServer`               |
| `resource_id`      | TEXT      | The resource identifier                     |
| `outcome`          | TEXT      | `success` or `failure`                      |
| `error_code`       | TEXT?     | Present on `failure` rows                   |
| `correlation_id`   | TEXT?     | Request correlation ID                      |

**Indexes:** `(actor_user_id, occurred_at)`, `(resource_type, resource_id, occurred_at)`, `(occurred_at)`

**Sample SOC2 query — "all commands by user in a time window":**

```sql
SELECT action, resource_type, resource_id, outcome, occurred_at
FROM "AdminAuditLog"
WHERE actor_user_id = '<userId>'
  AND occurred_at >= '2026-01-01'
  AND occurred_at <  '2027-01-01'
ORDER BY occurred_at;
```

## Workspace audit — `WorkflowAuditLog`

Each workspace database contains a `WorkflowAuditLog` table populated by `WorkflowAuditLogWriter`, a `RunEventBus` subscriber. It records the following events:

| Event                         | Action written             |
| ----------------------------- | -------------------------- |
| `nodeCompleted`               | `workflow.node.completed`  |
| `nodeFailed`                  | `workflow.node.failed`     |
| `runSaved` (status=completed) | `workflow.run.completed`   |
| `runSaved` (status=failed)    | `workflow.run.failed`      |
| `connectionInvocationStarted` | `workflow.credential.used` |

**Schema** (workspace DB):

| Column             | Type      | Description                                         |
| ------------------ | --------- | --------------------------------------------------- |
| `id`               | UUID      | Unique row id                                       |
| `occurred_at`      | TIMESTAMP | Event timestamp                                     |
| `actor_user_id`    | TEXT      | `"system"` in V1 (run events carry no user context) |
| `actor_session_id` | TEXT?     | Always `null` in V1                                 |
| `action`           | TEXT      | See table above                                     |
| `resource_type`    | TEXT      | `node`, `run`, or `credential`                      |
| `resource_id`      | TEXT      | Node id, run id, or connection node id              |
| `outcome`          | TEXT      | `success` or `failure`                              |
| `error_code`       | TEXT?     | Error name on `nodeFailed` rows                     |
| `correlation_id`   | TEXT?     | Reserved for future use                             |
| `workflow_id`      | TEXT      | Denormalised for query convenience                  |
| `run_id`           | TEXT?     | Present on most rows                                |
| `node_id`          | TEXT?     | Present on node-level rows                          |

**Indexes:** `(actor_user_id, occurred_at)`, `(workflow_id, occurred_at)`

**Sample query — "all audit rows for a workflow run":**

```sql
SELECT action, resource_type, resource_id, outcome, occurred_at
FROM workflow_audit_log
WHERE workflow_id = '<workflowId>'
  AND run_id = '<runId>'
ORDER BY occurred_at;
```

**Note on actor in V1:** The `RunEventBus` carries no user context — it reflects engine-level events, not user actions. The actor is set to `"system"` for all workspace audit rows. The _who_ for workspace-triggered actions is captured at CP level (the admin or workspace session that initiated the run). Future versions may propagate a correlation ID linking CP admin-audit rows to workspace execution audit rows.

## Emission guarantees

- **Best-effort.** Audit write failures are logged and counted but do not block workflow execution or API responses. If audit persistence is degraded, the command/run still completes.
- **CP counter.** The CP `/health` endpoint exposes `auditEmissionFailures` — alert on this rising above zero.
- **No double-write.** Audit rows are written only to the DB, not to stdout or log files.

## Retention

- **CP `AdminAuditLog`:** 7 years recommended (typical SOC2 / ISO 27001 requirement). Retention policy is a legal/compliance decision; rows are not automatically pruned today.
- **Workspace `WorkflowAuditLog`:** 1 year suggested, with a per-workspace override planned for v2. No automatic pruning today.

## GDPR / right to erasure

See **Story H** design doc. Admin audit rows are pseudonymised (actor user ID replaced with a HMAC-keyed hash) rather than deleted, preserving the audit trail while removing direct personal identifiers. Workspace audit rows follow the same pseudonymisation pattern.
