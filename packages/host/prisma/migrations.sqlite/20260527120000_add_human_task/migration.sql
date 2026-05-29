-- Create HumanTask table for HITL story 02 (SQLite variant).
-- Mirrors the PostgreSQL migration but uses TEXT for timestamp columns (SQLite has no native TIMESTAMP type).

CREATE TABLE "human_task" (
    "id"                   TEXT NOT NULL PRIMARY KEY,
    "run_id"               TEXT NOT NULL,
    "workflow_id"          TEXT NOT NULL,
    "workspace_id"         TEXT,
    "node_id"              TEXT NOT NULL,
    "activation_id"        TEXT NOT NULL,
    "item_index"           INTEGER NOT NULL,
    "status"               TEXT NOT NULL,
    "channel"              TEXT NOT NULL,
    "subject_json"         TEXT NOT NULL,
    "metadata_json"        TEXT NOT NULL,
    "decision_schema_json" TEXT NOT NULL,
    "decision_schema_hash" TEXT NOT NULL,
    "on_timeout"           TEXT NOT NULL,
    "delivery_ref_json"    TEXT,
    "decision_json"        TEXT,
    "decided_at"           DATETIME,
    "decided_by_json"      TEXT,
    "resume_token_hash"    TEXT NOT NULL,
    "expires_at"           DATETIME NOT NULL,
    "created_at"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "human_task_run_id_idx" ON "human_task"("run_id");
CREATE INDEX "human_task_workflow_id_status_idx" ON "human_task"("workflow_id", "status");
CREATE INDEX "human_task_workspace_id_status_expires_at_idx" ON "human_task"("workspace_id", "status", "expires_at");
