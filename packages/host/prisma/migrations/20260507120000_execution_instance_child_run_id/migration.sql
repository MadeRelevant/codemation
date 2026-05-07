-- Add child_run_id to ExecutionInstance so SubWorkflow node activations can carry
-- a reference to the specific child run they spawned. Nullable; absent for all
-- non-SubWorkflow activations and for snapshots created before this migration.

ALTER TABLE "ExecutionInstance" ADD COLUMN "child_run_id" TEXT;
