CREATE TABLE IF NOT EXISTS "RunProjection" (
  "run_id" TEXT NOT NULL PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "updated_at" TEXT NOT NULL,
  "slot_states_json" TEXT NOT NULL,
  "mutable_state_json" TEXT,
  CONSTRAINT "RunProjection_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RunSlotProjection" (
  "run_id" TEXT NOT NULL PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "updated_at" TEXT NOT NULL,
  "slot_states_json" TEXT NOT NULL,
  CONSTRAINT "RunSlotProjection_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT OR IGNORE INTO "RunSlotProjection" (
  "run_id",
  "workflow_id",
  "revision",
  "updated_at",
  "slot_states_json"
)
SELECT
  "run_id",
  "workflow_id",
  "revision",
  "updated_at",
  "slot_states_json"
FROM "RunProjection";

DROP TABLE IF EXISTS "RunProjection";

CREATE INDEX IF NOT EXISTS "RunSlotProjection_workflow_id_updated_at_idx"
  ON "RunSlotProjection"("workflow_id", "updated_at");
