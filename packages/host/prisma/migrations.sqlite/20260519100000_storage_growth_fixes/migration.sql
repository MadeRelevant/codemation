-- Migration: Storage growth fixes (Sprint 14 Story 07) - SQLite variant
-- 1. Add WorkflowSnapshot table for run snapshot deduplication
-- 2. Add workflowSnapshotId FK to Run (nullable)
-- 3. Add payloadStorageKey to TelemetryArtifact
-- Note: SQLite has no md5() — runtime backfill handled by PrismaWorkflowSnapshotRepository.

-- Create WorkflowSnapshot table
CREATE TABLE "WorkflowSnapshot" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "workflow_id"   TEXT NOT NULL,
    "snapshot_hash" TEXT NOT NULL,
    "snapshot_json" TEXT NOT NULL,
    "created_at"    TEXT NOT NULL
);

CREATE UNIQUE INDEX "WorkflowSnapshot_workflow_id_snapshot_hash_key"
    ON "WorkflowSnapshot"("workflow_id", "snapshot_hash");

CREATE INDEX "WorkflowSnapshot_workflow_id_snapshot_hash_idx"
    ON "WorkflowSnapshot"("workflow_id", "snapshot_hash");

-- Add FK column to Run (nullable; SQLite cannot add FK constraints after the fact)
ALTER TABLE "Run" ADD COLUMN "workflow_snapshot_id" TEXT;

CREATE INDEX "Run_workflow_snapshot_id_idx"
    ON "Run"("workflow_snapshot_id");

-- Add payloadStorageKey to TelemetryArtifact
ALTER TABLE "TelemetryArtifact" ADD COLUMN "payload_storage_key" TEXT;
