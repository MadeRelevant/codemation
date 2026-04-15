PRAGMA foreign_keys=OFF;

CREATE TABLE "new_RunTraceContext" (
  "run_id" TEXT NOT NULL PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "root_span_id" TEXT NOT NULL,
  "service_name" TEXT,
  "created_at" TEXT NOT NULL,
  "expires_at" TEXT
);

INSERT INTO "new_RunTraceContext" (
  "run_id",
  "workflow_id",
  "trace_id",
  "root_span_id",
  "service_name",
  "created_at",
  "expires_at"
)
SELECT
  "run_id",
  "workflow_id",
  "trace_id",
  "root_span_id",
  "service_name",
  "created_at",
  NULL
FROM "RunTraceContext";

CREATE TABLE "new_TelemetrySpan" (
  "telemetry_span_id" TEXT NOT NULL PRIMARY KEY,
  "trace_id" TEXT NOT NULL,
  "span_id" TEXT NOT NULL,
  "parent_span_id" TEXT,
  "run_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "node_id" TEXT,
  "activation_id" TEXT,
  "connection_invocation_id" TEXT,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT,
  "status_message" TEXT,
  "start_time" TEXT,
  "end_time" TEXT,
  "workflow_folder" TEXT,
  "node_type" TEXT,
  "node_role" TEXT,
  "model_name" TEXT,
  "attributes_json" TEXT,
  "events_json" TEXT,
  "retention_expires_at" TEXT,
  "updated_at" TEXT NOT NULL
);

INSERT INTO "new_TelemetrySpan" (
  "telemetry_span_id",
  "trace_id",
  "span_id",
  "parent_span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "connection_invocation_id",
  "name",
  "kind",
  "status",
  "status_message",
  "start_time",
  "end_time",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "attributes_json",
  "events_json",
  "retention_expires_at",
  "updated_at"
)
SELECT
  "telemetry_span_id",
  "trace_id",
  "span_id",
  "parent_span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "connection_invocation_id",
  "name",
  "kind",
  "status",
  "status_message",
  "start_time",
  "end_time",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "attributes_json",
  "events_json",
  NULL,
  "updated_at"
FROM "TelemetrySpan";

CREATE TABLE "TelemetryMetricPoint" (
  "metric_point_id" TEXT NOT NULL PRIMARY KEY,
  "trace_id" TEXT,
  "span_id" TEXT,
  "run_id" TEXT,
  "workflow_id" TEXT NOT NULL,
  "node_id" TEXT,
  "activation_id" TEXT,
  "metric_name" TEXT NOT NULL,
  "value" REAL NOT NULL,
  "unit" TEXT,
  "observed_at" TEXT NOT NULL,
  "workflow_folder" TEXT,
  "node_type" TEXT,
  "node_role" TEXT,
  "model_name" TEXT,
  "dimensions_json" TEXT,
  "retention_expires_at" TEXT
);

INSERT INTO "TelemetryMetricPoint" (
  "metric_point_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "metric_name",
  "value",
  "unit",
  "observed_at",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "dimensions_json",
  "retention_expires_at"
)
SELECT
  lower(hex(randomblob(16))),
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  'gen_ai.usage.input_tokens',
  "input_tokens",
  NULL,
  COALESCE("end_time", "start_time", "updated_at"),
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  NULL,
  NULL
FROM "TelemetrySpan"
WHERE "input_tokens" IS NOT NULL;

INSERT INTO "TelemetryMetricPoint" (
  "metric_point_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "metric_name",
  "value",
  "unit",
  "observed_at",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "dimensions_json",
  "retention_expires_at"
)
SELECT
  lower(hex(randomblob(16))),
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  'gen_ai.usage.output_tokens',
  "output_tokens",
  NULL,
  COALESCE("end_time", "start_time", "updated_at"),
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  NULL,
  NULL
FROM "TelemetrySpan"
WHERE "output_tokens" IS NOT NULL;

INSERT INTO "TelemetryMetricPoint" (
  "metric_point_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "metric_name",
  "value",
  "unit",
  "observed_at",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "dimensions_json",
  "retention_expires_at"
)
SELECT
  lower(hex(randomblob(16))),
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  'gen_ai.usage.total_tokens',
  "total_tokens",
  NULL,
  COALESCE("end_time", "start_time", "updated_at"),
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  NULL,
  NULL
FROM "TelemetrySpan"
WHERE "total_tokens" IS NOT NULL;

INSERT INTO "TelemetryMetricPoint" (
  "metric_point_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "metric_name",
  "value",
  "unit",
  "observed_at",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "dimensions_json",
  "retention_expires_at"
)
SELECT
  lower(hex(randomblob(16))),
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  'gen_ai.usage.cache_read.input_tokens',
  "cached_input_tokens",
  NULL,
  COALESCE("end_time", "start_time", "updated_at"),
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  NULL,
  NULL
FROM "TelemetrySpan"
WHERE "cached_input_tokens" IS NOT NULL;

INSERT INTO "TelemetryMetricPoint" (
  "metric_point_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "metric_name",
  "value",
  "unit",
  "observed_at",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "dimensions_json",
  "retention_expires_at"
)
SELECT
  lower(hex(randomblob(16))),
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  'codemation.gen_ai.usage.reasoning_tokens',
  "reasoning_tokens",
  NULL,
  COALESCE("end_time", "start_time", "updated_at"),
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  NULL,
  NULL
FROM "TelemetrySpan"
WHERE "reasoning_tokens" IS NOT NULL;

INSERT INTO "TelemetryMetricPoint" (
  "metric_point_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "metric_name",
  "value",
  "unit",
  "observed_at",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "dimensions_json",
  "retention_expires_at"
)
SELECT
  lower(hex(randomblob(16))),
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  'codemation.ai.turns',
  "turn_count",
  NULL,
  COALESCE("end_time", "start_time", "updated_at"),
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  NULL,
  NULL
FROM "TelemetrySpan"
WHERE "turn_count" IS NOT NULL;

INSERT INTO "TelemetryMetricPoint" (
  "metric_point_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "metric_name",
  "value",
  "unit",
  "observed_at",
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  "dimensions_json",
  "retention_expires_at"
)
SELECT
  lower(hex(randomblob(16))),
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  'codemation.ai.tool_calls',
  "tool_call_count",
  NULL,
  COALESCE("end_time", "start_time", "updated_at"),
  "workflow_folder",
  "node_type",
  "node_role",
  "model_name",
  NULL,
  NULL
FROM "TelemetrySpan"
WHERE "tool_call_count" IS NOT NULL;

CREATE TABLE "new_TelemetryArtifact" (
  "artifact_id" TEXT NOT NULL PRIMARY KEY,
  "trace_id" TEXT NOT NULL,
  "span_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "node_id" TEXT,
  "activation_id" TEXT,
  "kind" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "preview_text" TEXT,
  "preview_json" TEXT,
  "payload_text" TEXT,
  "payload_json" TEXT,
  "bytes" INTEGER,
  "truncated" BOOLEAN,
  "created_at" TEXT NOT NULL,
  "expires_at" TEXT,
  "retention_expires_at" TEXT
);

INSERT INTO "new_TelemetryArtifact" (
  "artifact_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "kind",
  "content_type",
  "preview_text",
  "preview_json",
  "payload_text",
  "payload_json",
  "bytes",
  "truncated",
  "created_at",
  "expires_at",
  "retention_expires_at"
)
SELECT
  "artifact_id",
  "trace_id",
  "span_id",
  "run_id",
  "workflow_id",
  "node_id",
  "activation_id",
  "kind",
  "content_type",
  "preview_text",
  "preview_json",
  "payload_text",
  "payload_json",
  "bytes",
  "truncated",
  "created_at",
  "expires_at",
  NULL
FROM "TelemetryArtifact";

DROP TABLE "RunTraceContext";
ALTER TABLE "new_RunTraceContext" RENAME TO "RunTraceContext";

DROP TABLE "TelemetrySpan";
ALTER TABLE "new_TelemetrySpan" RENAME TO "TelemetrySpan";

DROP TABLE "TelemetryArtifact";
ALTER TABLE "new_TelemetryArtifact" RENAME TO "TelemetryArtifact";

CREATE UNIQUE INDEX "RunTraceContext_trace_id_key"
  ON "RunTraceContext"("trace_id");

CREATE INDEX "RunTraceContext_workflow_id_created_at_idx"
  ON "RunTraceContext"("workflow_id", "created_at");

CREATE UNIQUE INDEX "TelemetrySpan_trace_id_span_id_key"
  ON "TelemetrySpan"("trace_id", "span_id");

CREATE INDEX "TelemetrySpan_trace_id_start_time_idx"
  ON "TelemetrySpan"("trace_id", "start_time");

CREATE INDEX "TelemetrySpan_workflow_id_end_time_idx"
  ON "TelemetrySpan"("workflow_id", "end_time");

CREATE INDEX "TelemetrySpan_workflow_id_status_end_time_idx"
  ON "TelemetrySpan"("workflow_id", "status", "end_time");

CREATE INDEX "TelemetrySpan_run_id_end_time_idx"
  ON "TelemetrySpan"("run_id", "end_time");

CREATE INDEX "TelemetrySpan_model_name_end_time_idx"
  ON "TelemetrySpan"("model_name", "end_time");

CREATE INDEX "TelemetrySpan_connection_invocation_id_idx"
  ON "TelemetrySpan"("connection_invocation_id");

CREATE INDEX "TelemetrySpan_retention_expires_at_idx"
  ON "TelemetrySpan"("retention_expires_at");

CREATE INDEX "TelemetryArtifact_trace_id_created_at_idx"
  ON "TelemetryArtifact"("trace_id", "created_at");

CREATE INDEX "TelemetryArtifact_span_id_created_at_idx"
  ON "TelemetryArtifact"("span_id", "created_at");

CREATE INDEX "TelemetryArtifact_run_id_created_at_idx"
  ON "TelemetryArtifact"("run_id", "created_at");

CREATE INDEX "TelemetryArtifact_retention_expires_at_idx"
  ON "TelemetryArtifact"("retention_expires_at");

CREATE INDEX "TelemetryMetricPoint_workflow_id_observed_at_idx"
  ON "TelemetryMetricPoint"("workflow_id", "observed_at");

CREATE INDEX "TelemetryMetricPoint_workflow_id_metric_name_observed_at_idx"
  ON "TelemetryMetricPoint"("workflow_id", "metric_name", "observed_at");

CREATE INDEX "TelemetryMetricPoint_run_id_observed_at_idx"
  ON "TelemetryMetricPoint"("run_id", "observed_at");

CREATE INDEX "TelemetryMetricPoint_trace_id_observed_at_idx"
  ON "TelemetryMetricPoint"("trace_id", "observed_at");

CREATE INDEX "TelemetryMetricPoint_model_name_observed_at_idx"
  ON "TelemetryMetricPoint"("model_name", "observed_at");

CREATE INDEX "TelemetryMetricPoint_retention_expires_at_idx"
  ON "TelemetryMetricPoint"("retention_expires_at");

PRAGMA foreign_keys=ON;
