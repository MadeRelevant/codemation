-- Add dedicated hitl_state_json column to Run table (SQLite variant).
-- Replaces the interim _hitl* key stash inside mutable_state_json (commit 63a6cfb3).
-- Old rows with _hitl* keys inside mutable_state_json are still handled by the
-- repository's legacy-fallback load path until re-saved with the new column.

ALTER TABLE "Run" ADD COLUMN "hitl_state_json" TEXT;
