ALTER TABLE "RunProjection" RENAME TO "RunSlotProjection";

ALTER INDEX IF EXISTS "RunProjection_pkey" RENAME TO "RunSlotProjection_pkey";
ALTER INDEX IF EXISTS "RunProjection_workflow_id_updated_at_idx" RENAME TO "RunSlotProjection_workflow_id_updated_at_idx";

ALTER TABLE "RunSlotProjection"
  RENAME CONSTRAINT "RunProjection_run_id_fkey" TO "RunSlotProjection_run_id_fkey";

ALTER TABLE "RunSlotProjection"
  DROP COLUMN IF EXISTS "mutable_state_json";
