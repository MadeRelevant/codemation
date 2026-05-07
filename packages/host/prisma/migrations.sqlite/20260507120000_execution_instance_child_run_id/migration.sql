-- Add child_run_id to ExecutionInstance (SQLite).
-- Nullable; absent for all non-SubWorkflow activations and for snapshots created
-- before this migration.

ALTER TABLE "ExecutionInstance" ADD COLUMN "child_run_id" TEXT;
