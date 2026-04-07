-- Replace monolithic Run.state_json with normalized runtime storage for SQLite.

ALTER TABLE "Run" RENAME TO "Run_legacy";

CREATE TABLE "Run" (
    "run_id" TEXT NOT NULL PRIMARY KEY,
    "workflow_id" TEXT NOT NULL,
    "started_at" TEXT NOT NULL,
    "finished_at" TEXT,
    "status" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "parent_json" TEXT,
    "execution_options_json" TEXT,
    "control_json" TEXT,
    "workflow_snapshot_json" TEXT,
    "policy_snapshot_json" TEXT,
    "engine_counters_json" TEXT,
    "mutable_state_json" TEXT,
    "outputs_by_node_json" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

INSERT INTO "Run" (
    "run_id",
    "workflow_id",
    "started_at",
    "finished_at",
    "status",
    "revision",
    "parent_json",
    "execution_options_json",
    "control_json",
    "workflow_snapshot_json",
    "policy_snapshot_json",
    "engine_counters_json",
    "mutable_state_json",
    "outputs_by_node_json",
    "updated_at"
)
SELECT
    r."run_id",
    r."workflow_id",
    r."started_at",
    CASE
        WHEN r."status" IN ('completed', 'failed') THEN COALESCE(
            (
                SELECT MAX(json_extract(snapshot.value, '$.finishedAt'))
                FROM json_each(COALESCE(json_extract(r."state_json", '$.nodeSnapshotsByNodeId'), '{}')) AS snapshot
            ),
            r."updated_at"
        )
        ELSE NULL
    END,
    r."status",
    COALESCE(CAST(json_extract(r."state_json", '$.revision') AS INTEGER), 0),
    r."parent_json",
    r."execution_options_json",
    json_extract(r."state_json", '$.control'),
    json_extract(r."state_json", '$.workflowSnapshot'),
    json_extract(r."state_json", '$.policySnapshot'),
    json_extract(r."state_json", '$.engineCounters'),
    json_extract(r."state_json", '$.mutableState'),
    COALESCE(json_extract(r."state_json", '$.outputsByNode'), '{}'),
    r."updated_at"
FROM "Run_legacy" r;

CREATE INDEX "Run_workflow_id_started_at_idx" ON "Run"("workflow_id", "started_at");
CREATE INDEX "Run_workflow_id_status_finished_at_idx" ON "Run"("workflow_id", "status", "finished_at");

CREATE TABLE "RunWorkItem" (
  "work_item_id" TEXT NOT NULL PRIMARY KEY,
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
  CONSTRAINT "RunWorkItem_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RunWorkItem_run_id_status_available_at_idx"
  ON "RunWorkItem"("run_id", "status", "available_at");
CREATE INDEX "RunWorkItem_run_id_target_node_id_batch_id_idx"
  ON "RunWorkItem"("run_id", "target_node_id", "batch_id");

CREATE TABLE "ExecutionInstance" (
  "instance_id" TEXT NOT NULL PRIMARY KEY,
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
  CONSTRAINT "ExecutionInstance_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ExecutionInstance_run_id_slot_node_id_updated_at_idx"
  ON "ExecutionInstance"("run_id", "slot_node_id", "updated_at");
CREATE INDEX "ExecutionInstance_run_id_parent_instance_id_updated_at_idx"
  ON "ExecutionInstance"("run_id", "parent_instance_id", "updated_at");
CREATE INDEX "ExecutionInstance_run_id_kind_updated_at_idx"
  ON "ExecutionInstance"("run_id", "kind", "updated_at");
CREATE UNIQUE INDEX "ExecutionInstance_run_id_slot_node_id_run_index_key"
  ON "ExecutionInstance"("run_id", "slot_node_id", "run_index");

CREATE TABLE "RunProjection" (
  "run_id" TEXT NOT NULL PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "updated_at" TEXT NOT NULL,
  "slot_states_json" TEXT NOT NULL,
  "mutable_state_json" TEXT,
  CONSTRAINT "RunProjection_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RunProjection_workflow_id_updated_at_idx"
  ON "RunProjection"("workflow_id", "updated_at");

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
  r."run_id" || ':queue:' || CAST(CAST(q.key AS INTEGER) + 1 AS TEXT),
  r."run_id",
  r."workflow_id",
  'queued',
  json_extract(q.value, '$.nodeId'),
  COALESCE(json_extract(q.value, '$.batchId'), 'batch_1'),
  r."updated_at",
  r."updated_at",
  COALESCE(json_array_length(COALESCE(json_extract(q.value, '$.input'), '[]')), 0),
  CASE
    WHEN json_type(q.value, '$.collect') IS NOT NULL THEN COALESCE(json_extract(q.value, '$.collect.received'), '{}')
    ELSE json_object(
      COALESCE(json_extract(q.value, '$.toInput'), 'in'),
      json(COALESCE(json_extract(q.value, '$.input'), '[]'))
    )
  END
FROM "Run_legacy" r
JOIN json_each(COALESCE(json_extract(r."state_json", '$.queue'), '[]')) AS q;

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
  COALESCE(json_extract(r."state_json", '$.pending.activationId'), r."run_id" || ':pending'),
  r."run_id",
  r."workflow_id",
  'claimed',
  json_extract(r."state_json", '$.pending.nodeId'),
  COALESCE(json_extract(r."state_json", '$.pending.batchId'), 'batch_1'),
  json_extract(r."state_json", '$.pending.queue'),
  COALESCE(json_extract(r."state_json", '$.pending.enqueuedAt'), r."updated_at"),
  COALESCE(json_extract(r."state_json", '$.pending.enqueuedAt'), r."updated_at"),
  COALESCE(CAST(json_extract(r."state_json", '$.pending.itemsIn') AS INTEGER), 0),
  COALESCE(json_extract(r."state_json", '$.pending.inputsByPort'), '{}')
FROM "Run_legacy" r
WHERE json_type(r."state_json", '$.pending') IS NOT NULL;

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
  r."run_id" || ':node:' || snapshot.key || ':' || COALESCE(json_extract(snapshot.value, '$.activationId'), 'na'),
  r."run_id",
  r."workflow_id",
  snapshot.key,
  snapshot.key,
  'workflowNodeActivation',
  json_extract(snapshot.value, '$.activationId'),
  COALESCE(json_extract(r."state_json", '$.pending.batchId'), 'batch_1'),
  1,
  COALESCE(json_extract(snapshot.value, '$.status'), 'completed'),
  json_extract(snapshot.value, '$.queuedAt'),
  json_extract(snapshot.value, '$.startedAt'),
  json_extract(snapshot.value, '$.finishedAt'),
  COALESCE(json_extract(snapshot.value, '$.updatedAt'), r."updated_at"),
  COALESCE(json_array_length(COALESCE(json_extract(snapshot.value, '$.outputs.main'), '[]')), 0),
  json_extract(snapshot.value, '$.inputsByPort'),
  json_extract(snapshot.value, '$.outputs'),
  json_extract(snapshot.value, '$.error'),
  CAST(json_extract(snapshot.value, '$.usedPinnedOutput') AS INTEGER)
FROM "Run_legacy" r
JOIN json_each(COALESCE(json_extract(r."state_json", '$.nodeSnapshotsByNodeId'), '{}')) AS snapshot;

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
  json_extract(inv.value, '$.invocationId'),
  r."run_id",
  r."workflow_id",
  json_extract(inv.value, '$.connectionNodeId'),
  json_extract(inv.value, '$.parentAgentNodeId'),
  'connectionInvocation',
  'languageModel',
  json_extract(inv.value, '$.parentAgentActivationId'),
  COALESCE(json_extract(r."state_json", '$.pending.batchId'), 'batch_1'),
  1000000 + CAST(inv.key AS INTEGER) + 1,
  COALESCE(json_extract(inv.value, '$.status'), 'completed'),
  json_extract(inv.value, '$.queuedAt'),
  json_extract(inv.value, '$.startedAt'),
  json_extract(inv.value, '$.finishedAt'),
  COALESCE(json_extract(inv.value, '$.updatedAt'), r."updated_at"),
  0,
  json_extract(inv.value, '$.managedInput'),
  json_extract(inv.value, '$.managedOutput'),
  json_extract(inv.value, '$.error')
FROM "Run_legacy" r
JOIN json_each(COALESCE(json_extract(r."state_json", '$.connectionInvocations'), '[]')) AS inv;

INSERT INTO "RunProjection" (
  "run_id",
  "workflow_id",
  "revision",
  "updated_at",
  "slot_states_json",
  "mutable_state_json"
)
SELECT
  r."run_id",
  r."workflow_id",
  r."revision",
  r."updated_at",
  json_object('slotStatesByNodeId', json('{}')),
  NULL
FROM "Run" r;

DROP TABLE "Run_legacy";
