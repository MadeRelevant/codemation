-- Add per-item iteration identity columns to ExecutionInstance (Postgres).
-- These are required so connection invocations restored from disk preserve the
-- per-item identity that the engine stamps on them at runtime; the bottom
-- execution tree groups invocations by iterationId to render synthetic
-- "Item N" parent rows when an agent processed 2+ items.
ALTER TABLE "ExecutionInstance"
  ADD COLUMN "iteration_id" TEXT,
  ADD COLUMN "item_index" INTEGER,
  ADD COLUMN "parent_invocation_id" TEXT;

CREATE INDEX "ExecutionInstance_iteration_id_idx" ON "ExecutionInstance"("iteration_id");
