-- Migration: Storage growth fixes (Sprint 14 Story 07)
-- 1. Add WorkflowSnapshot table for run snapshot deduplication (keyed by content hash)
-- 2. Add workflowSnapshotId FK to Run (nullable - existing rows remain valid)
-- 3. Add payloadStorageKey to TelemetryArtifact for large-payload offload
-- 4. Backfill: insert unique (workflowId, snapshotHash) snapshots from existing Run rows
-- 5. Set workflowSnapshotId on backfilled runs

-- Create WorkflowSnapshot table
CREATE TABLE "WorkflowSnapshot" (
    "id"            TEXT NOT NULL,
    "workflow_id"   TEXT NOT NULL,
    "snapshot_hash" TEXT NOT NULL,
    "snapshot_json" TEXT NOT NULL,
    "created_at"    TEXT NOT NULL,
    CONSTRAINT "WorkflowSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowSnapshot_workflow_id_snapshot_hash_key"
    ON "WorkflowSnapshot"("workflow_id", "snapshot_hash");

CREATE INDEX "WorkflowSnapshot_workflow_id_snapshot_hash_idx"
    ON "WorkflowSnapshot"("workflow_id", "snapshot_hash");

-- Add FK column to Run (nullable)
ALTER TABLE "Run" ADD COLUMN "workflow_snapshot_id" TEXT;

CREATE INDEX "Run_workflow_snapshot_id_idx"
    ON "Run"("workflow_snapshot_id");

ALTER TABLE "Run"
    ADD CONSTRAINT "Run_workflow_snapshot_id_fkey"
    FOREIGN KEY ("workflow_snapshot_id")
    REFERENCES "WorkflowSnapshot"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

-- Add payloadStorageKey to TelemetryArtifact
ALTER TABLE "TelemetryArtifact" ADD COLUMN "payload_storage_key" TEXT;

-- Backfill: deduplicate workflow snapshots from existing Run rows by content hash.
-- md5 is available in PostgreSQL without extensions; we use encode(digest(...), 'hex')
-- from pgcrypto — fall back to md5 which is always available.
INSERT INTO "WorkflowSnapshot" ("id", "workflow_id", "snapshot_hash", "snapshot_json", "created_at")
SELECT DISTINCT ON (r."workflow_id", md5(r."workflow_snapshot_json"))
    gen_random_uuid()::text,
    r."workflow_id",
    md5(r."workflow_snapshot_json"),
    r."workflow_snapshot_json",
    MIN(r."started_at") OVER (PARTITION BY r."workflow_id", md5(r."workflow_snapshot_json"))
FROM "Run" r
WHERE r."workflow_snapshot_json" IS NOT NULL
ON CONFLICT ("workflow_id", "snapshot_hash") DO NOTHING;

-- Set workflowSnapshotId on existing runs that have snapshots
UPDATE "Run" r
SET "workflow_snapshot_id" = ws."id"
FROM "WorkflowSnapshot" ws
WHERE r."workflow_id" = ws."workflow_id"
  AND md5(r."workflow_snapshot_json") = ws."snapshot_hash"
  AND r."workflow_snapshot_json" IS NOT NULL
  AND r."workflow_snapshot_id" IS NULL;
