-- Create WorkflowAuditLog table for workspace-local run-event audit trail (Sprint 13 Story B).
-- SQLite variant: no TIMESTAMP(3), no quoted identifiers.

CREATE TABLE workflow_audit_log (
    id               TEXT NOT NULL PRIMARY KEY,
    occurred_at      DATETIME NOT NULL,
    actor_user_id    TEXT NOT NULL,
    actor_session_id TEXT,
    action           TEXT NOT NULL,
    resource_type    TEXT NOT NULL,
    resource_id      TEXT NOT NULL,
    outcome          TEXT NOT NULL,
    error_code       TEXT,
    correlation_id   TEXT,
    workflow_id      TEXT NOT NULL,
    run_id           TEXT,
    node_id          TEXT
);

CREATE INDEX workflow_audit_log_actor_user_id_occurred_at_idx ON workflow_audit_log(actor_user_id, occurred_at);
CREATE INDEX workflow_audit_log_workflow_id_occurred_at_idx ON workflow_audit_log(workflow_id, occurred_at);
