-- Replace monolithic Run.state_json with normalized runtime storage.

ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "finished_at" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "control_json" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "workflow_snapshot_json" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "policy_snapshot_json" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "engine_counters_json" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "mutable_state_json" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "outputs_by_node_json" TEXT;

UPDATE "Run"
SET
  "control_json" = CASE
    WHEN "state_json"::jsonb ? 'control' THEN ("state_json"::jsonb->'control')::text
    ELSE NULL
  END,
  "workflow_snapshot_json" = CASE
    WHEN "state_json"::jsonb ? 'workflowSnapshot' THEN ("state_json"::jsonb->'workflowSnapshot')::text
    ELSE NULL
  END,
  "policy_snapshot_json" = CASE
    WHEN "state_json"::jsonb ? 'policySnapshot' THEN ("state_json"::jsonb->'policySnapshot')::text
    ELSE NULL
  END,
  "engine_counters_json" = CASE
    WHEN "state_json"::jsonb ? 'engineCounters' THEN ("state_json"::jsonb->'engineCounters')::text
    ELSE NULL
  END,
  "mutable_state_json" = CASE
    WHEN "state_json"::jsonb ? 'mutableState' THEN ("state_json"::jsonb->'mutableState')::text
    ELSE NULL
  END,
  "outputs_by_node_json" = COALESCE(("state_json"::jsonb->'outputsByNode')::text, '{}')
WHERE "outputs_by_node_json" IS NULL;

ALTER TABLE "Run" ALTER COLUMN "outputs_by_node_json" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "RunWorkItem" (
  "work_item_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "target_node_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "queue_name" TEXT,
  "claim_token" TEXT,
  "claimed_by" TEXT,
  "claimed_at" TEXT,
  "available_at" TEXT NOT NULL,
  "enqueued_at" TEXT NOT NULL,
  "completed_at" TEXT,
  "failed_at" TEXT,
  "source_instance_id" TEXT,
  "parent_instance_id" TEXT,
  "items_in" INTEGER NOT NULL,
  "inputs_by_port_json" TEXT NOT NULL,
  "error_json" TEXT,

  CONSTRAINT "RunWorkItem_pkey" PRIMARY KEY ("work_item_id")
);

CREATE INDEX IF NOT EXISTS "RunWorkItem_run_id_status_available_at_idx"
  ON "RunWorkItem"("run_id", "status", "available_at");
CREATE INDEX IF NOT EXISTS "RunWorkItem_run_id_target_node_id_batch_id_idx"
  ON "RunWorkItem"("run_id", "target_node_id", "batch_id");

CREATE TABLE IF NOT EXISTS "ExecutionInstance" (
  "instance_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "slot_node_id" TEXT NOT NULL,
  "workflow_node_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "connection_kind" TEXT,
  "activation_id" TEXT,
  "batch_id" TEXT NOT NULL,
  "run_index" INTEGER NOT NULL,
  "parent_instance_id" TEXT,
  "parent_run_id" TEXT,
  "worker_claim_token" TEXT,
  "status" TEXT NOT NULL,
  "queued_at" TEXT,
  "started_at" TEXT,
  "finished_at" TEXT,
  "updated_at" TEXT NOT NULL,
  "item_count" INTEGER NOT NULL,
  "input_json" TEXT,
  "output_json" TEXT,
  "error_json" TEXT,
  "input_item_indices_json" TEXT,
  "output_item_count" INTEGER,
  "successful_item_count" INTEGER,
  "failed_item_count" INTEGER,
  "input_storage_kind" TEXT,
  "output_storage_kind" TEXT,
  "input_bytes" INTEGER,
  "output_bytes" INTEGER,
  "input_preview_json" TEXT,
  "output_preview_json" TEXT,
  "input_payload_ref" TEXT,
  "output_payload_ref" TEXT,
  "input_truncated" BOOLEAN,
  "output_truncated" BOOLEAN,
  "used_pinned_output" BOOLEAN,

  CONSTRAINT "ExecutionInstance_pkey" PRIMARY KEY ("instance_id")
);

CREATE INDEX IF NOT EXISTS "ExecutionInstance_run_id_slot_node_id_updated_at_idx"
  ON "ExecutionInstance"("run_id", "slot_node_id", "updated_at");
CREATE INDEX IF NOT EXISTS "ExecutionInstance_run_id_parent_instance_id_updated_at_idx"
  ON "ExecutionInstance"("run_id", "parent_instance_id", "updated_at");
CREATE INDEX IF NOT EXISTS "ExecutionInstance_run_id_kind_updated_at_idx"
  ON "ExecutionInstance"("run_id", "kind", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ExecutionInstance_run_id_slot_node_id_run_index_key"
  ON "ExecutionInstance"("run_id", "slot_node_id", "run_index");

CREATE TABLE IF NOT EXISTS "RunProjection" (
  "run_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "updated_at" TEXT NOT NULL,
  "slot_states_json" TEXT NOT NULL,
  "mutable_state_json" TEXT,

  CONSTRAINT "RunProjection_pkey" PRIMARY KEY ("run_id")
);

CREATE INDEX IF NOT EXISTS "RunProjection_workflow_id_updated_at_idx"
  ON "RunProjection"("workflow_id", "updated_at");

ALTER TABLE "RunWorkItem" DROP CONSTRAINT IF EXISTS "RunWorkItem_run_id_fkey";
ALTER TABLE "RunWorkItem"
  ADD CONSTRAINT "RunWorkItem_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecutionInstance" DROP CONSTRAINT IF EXISTS "ExecutionInstance_run_id_fkey";
ALTER TABLE "ExecutionInstance"
  ADD CONSTRAINT "ExecutionInstance_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RunProjection" DROP CONSTRAINT IF EXISTS "RunProjection_run_id_fkey";
ALTER TABLE "RunProjection"
  ADD CONSTRAINT "RunProjection_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill current queue / pending work items from the legacy aggregate.
INSERT INTO "RunWorkItem" (
  "work_item_id",
  "run_id",
  "workflow_id",
  "status",
  "target_node_id",
  "batch_id",
  "available_at",
  "enqueued_at",
  "items_in",
  "inputs_by_port_json"
)
SELECT
  CONCAT(r."run_id", ':queue:', q.ordinality),
  r."run_id",
  r."workflow_id",
  'queued',
  q.entry->>'nodeId',
  COALESCE(q.entry->>'batchId', 'batch_1'),
  r."updated_at",
  r."updated_at",
  COALESCE(jsonb_array_length(COALESCE(q.entry->'input', '[]'::jsonb)), 0),
  CASE
    WHEN q.entry ? 'collect' THEN COALESCE((q.entry->'collect'->'received')::text, '{}'::text)
    ELSE jsonb_build_object(COALESCE(q.entry->>'toInput', 'in'), COALESCE(q.entry->'input', '[]'::jsonb))::text
  END
FROM "Run" r
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r."state_json"::jsonb->'queue', '[]'::jsonb)) WITH ORDINALITY AS q(entry, ordinality)
WHERE r."state_json" IS NOT NULL;

INSERT INTO "RunWorkItem" (
  "work_item_id",
  "run_id",
  "workflow_id",
  "status",
  "target_node_id",
  "batch_id",
  "queue_name",
  "available_at",
  "enqueued_at",
  "items_in",
  "inputs_by_port_json"
)
SELECT
  COALESCE(r."state_json"::jsonb->'pending'->>'activationId', CONCAT(r."run_id", ':pending')),
  r."run_id",
  r."workflow_id",
  'claimed',
  r."state_json"::jsonb->'pending'->>'nodeId',
  COALESCE(r."state_json"::jsonb->'pending'->>'batchId', 'batch_1'),
  r."state_json"::jsonb->'pending'->>'queue',
  COALESCE(r."state_json"::jsonb->'pending'->>'enqueuedAt', r."updated_at"),
  COALESCE(r."state_json"::jsonb->'pending'->>'enqueuedAt', r."updated_at"),
  COALESCE((r."state_json"::jsonb->'pending'->>'itemsIn')::INTEGER, 0),
  COALESCE((r."state_json"::jsonb->'pending'->'inputsByPort')::text, '{}'::text)
FROM "Run" r
WHERE r."state_json" IS NOT NULL
  AND r."state_json"::jsonb ? 'pending'
  AND r."state_json"::jsonb->'pending' IS NOT NULL;

-- Backfill latest workflow-node snapshots and connection invocations as execution instances.
INSERT INTO "ExecutionInstance" (
  "instance_id",
  "run_id",
  "workflow_id",
  "slot_node_id",
  "workflow_node_id",
  "kind",
  "activation_id",
  "batch_id",
  "run_index",
  "status",
  "queued_at",
  "started_at",
  "finished_at",
  "updated_at",
  "item_count",
  "input_json",
  "output_json",
  "error_json",
  "used_pinned_output"
)
SELECT
  CONCAT(r."run_id", ':node:', s.key, ':', COALESCE(s.value->>'activationId', 'na')),
  r."run_id",
  r."workflow_id",
  s.key,
  s.key,
  'workflowNodeActivation',
  s.value->>'activationId',
  COALESCE(r."state_json"::jsonb->'pending'->>'batchId', 'batch_1'),
  1,
  COALESCE(s.value->>'status', 'completed'),
  s.value->>'queuedAt',
  s.value->>'startedAt',
  s.value->>'finishedAt',
  COALESCE(s.value->>'updatedAt', r."updated_at"),
  COALESCE(jsonb_array_length(COALESCE(s.value->'outputs'->'main', '[]'::jsonb)), 0),
  CASE WHEN s.value ? 'inputsByPort' THEN (s.value->'inputsByPort')::text ELSE NULL END,
  CASE WHEN s.value ? 'outputs' THEN (s.value->'outputs')::text ELSE NULL END,
  CASE WHEN s.value ? 'error' THEN (s.value->'error')::text ELSE NULL END,
  CASE WHEN s.value ? 'usedPinnedOutput' THEN (s.value->>'usedPinnedOutput')::BOOLEAN ELSE NULL END
FROM "Run" r
CROSS JOIN LATERAL jsonb_each(COALESCE(r."state_json"::jsonb->'nodeSnapshotsByNodeId', '{}'::jsonb)) AS s(key, value)
WHERE r."state_json" IS NOT NULL;

INSERT INTO "ExecutionInstance" (
  "instance_id",
  "run_id",
  "workflow_id",
  "slot_node_id",
  "workflow_node_id",
  "kind",
  "connection_kind",
  "activation_id",
  "batch_id",
  "run_index",
  "status",
  "queued_at",
  "started_at",
  "finished_at",
  "updated_at",
  "item_count",
  "input_json",
  "output_json",
  "error_json"
)
SELECT
  inv.value->>'invocationId',
  r."run_id",
  r."workflow_id",
  inv.value->>'connectionNodeId',
  inv.value->>'parentAgentNodeId',
  'connectionInvocation',
  'languageModel',
  inv.value->>'parentAgentActivationId',
  COALESCE(r."state_json"::jsonb->'pending'->>'batchId', 'batch_1'),
  1000000 + inv.ordinality::INTEGER,
  COALESCE(inv.value->>'status', 'completed'),
  inv.value->>'queuedAt',
  inv.value->>'startedAt',
  inv.value->>'finishedAt',
  COALESCE(inv.value->>'updatedAt', r."updated_at"),
  0,
  CASE WHEN inv.value ? 'managedInput' THEN (inv.value->'managedInput')::text ELSE NULL END,
  CASE WHEN inv.value ? 'managedOutput' THEN (inv.value->'managedOutput')::text ELSE NULL END,
  CASE WHEN inv.value ? 'error' THEN (inv.value->'error')::text ELSE NULL END
FROM "Run" r
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r."state_json"::jsonb->'connectionInvocations', '[]'::jsonb)) WITH ORDINALITY AS inv(value, ordinality)
WHERE r."state_json" IS NOT NULL;

UPDATE "Run"
SET "finished_at" = COALESCE(
  (
    SELECT MAX(value->>'finishedAt')
    FROM jsonb_each(COALESCE("state_json"::jsonb->'nodeSnapshotsByNodeId', '{}'::jsonb))
  ),
  "updated_at"
)
WHERE "status" IN ('completed', 'failed')
  AND "state_json" IS NOT NULL;

INSERT INTO "RunProjection" ("run_id", "workflow_id", "revision", "updated_at", "slot_states_json", "mutable_state_json")
SELECT
  r."run_id",
  r."workflow_id",
  r."revision",
  r."updated_at",
  jsonb_build_object('slotStatesByNodeId', '{}'::jsonb)::text,
  NULL
FROM "Run" r
ON CONFLICT ("run_id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "Run_workflow_id_started_at_idx"
  ON "Run"("workflow_id", "started_at");
CREATE INDEX IF NOT EXISTS "Run_workflow_id_status_finished_at_idx"
  ON "Run"("workflow_id", "status", "finished_at");

ALTER TABLE "Run" DROP COLUMN IF EXISTS "state_json";
