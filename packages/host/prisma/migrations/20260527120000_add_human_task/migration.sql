-- Create HumanTask table for HITL story 02: durable task record + signed resume token.
-- Indexed for efficient "pending tasks for workspace/workflow" queries (story 06, 09).

CREATE TABLE "human_task" (
    "id"                   TEXT NOT NULL,
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
    "decided_at"           TIMESTAMP(3),
    "decided_by_json"      TEXT,
    "resume_token_hash"    TEXT NOT NULL,
    "expires_at"           TIMESTAMP(3) NOT NULL,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "human_task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "human_task_run_id_idx" ON "human_task"("run_id");
CREATE INDEX "human_task_workflow_id_status_idx" ON "human_task"("workflow_id", "status");
CREATE INDEX "human_task_workspace_id_status_expires_at_idx" ON "human_task"("workspace_id", "status", "expires_at");
