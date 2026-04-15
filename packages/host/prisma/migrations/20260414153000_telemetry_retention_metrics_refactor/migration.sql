ALTER TABLE "RunTraceContext"
  ADD COLUMN "expires_at" TEXT;

ALTER TABLE "RunTraceContext"
  DROP CONSTRAINT "RunTraceContext_run_id_fkey";

ALTER TABLE "TelemetrySpan"
  ADD COLUMN "retention_expires_at" TEXT;

ALTER TABLE "TelemetryArtifact"
  ADD COLUMN "retention_expires_at" TEXT;

ALTER TABLE "TelemetrySpan"
  DROP CONSTRAINT "TelemetrySpan_run_id_fkey";

ALTER TABLE "TelemetryArtifact"
  DROP CONSTRAINT "TelemetryArtifact_run_id_fkey";

CREATE TABLE "TelemetryMetricPoint" (
  "metric_point_id" TEXT NOT NULL,
  "trace_id" TEXT,
  "span_id" TEXT,
  "run_id" TEXT,
  "workflow_id" TEXT NOT NULL,
  "node_id" TEXT,
  "activation_id" TEXT,
  "metric_name" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "unit" TEXT,
  "observed_at" TEXT NOT NULL,
  "workflow_folder" TEXT,
  "node_type" TEXT,
  "node_role" TEXT,
  "model_name" TEXT,
  "dimensions_json" TEXT,
  "retention_expires_at" TEXT,

  CONSTRAINT "TelemetryMetricPoint_pkey" PRIMARY KEY ("metric_point_id")
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
  md5("telemetry_span_id" || ':gen_ai.usage.input_tokens'),
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
WHERE "input_tokens" IS NOT NULL
UNION ALL
SELECT
  md5("telemetry_span_id" || ':gen_ai.usage.output_tokens'),
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
WHERE "output_tokens" IS NOT NULL
UNION ALL
SELECT
  md5("telemetry_span_id" || ':gen_ai.usage.total_tokens'),
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
WHERE "total_tokens" IS NOT NULL
UNION ALL
SELECT
  md5("telemetry_span_id" || ':gen_ai.usage.cache_read.input_tokens'),
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
WHERE "cached_input_tokens" IS NOT NULL
UNION ALL
SELECT
  md5("telemetry_span_id" || ':codemation.gen_ai.usage.reasoning_tokens'),
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
WHERE "reasoning_tokens" IS NOT NULL
UNION ALL
SELECT
  md5("telemetry_span_id" || ':codemation.ai.turns'),
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
WHERE "turn_count" IS NOT NULL
UNION ALL
SELECT
  md5("telemetry_span_id" || ':codemation.ai.tool_calls'),
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

ALTER TABLE "TelemetrySpan"
  DROP COLUMN "input_tokens",
  DROP COLUMN "output_tokens",
  DROP COLUMN "total_tokens",
  DROP COLUMN "cached_input_tokens",
  DROP COLUMN "cache_creation_input_tokens",
  DROP COLUMN "reasoning_tokens",
  DROP COLUMN "turn_count",
  DROP COLUMN "tool_call_count";

CREATE INDEX "TelemetrySpan_retention_expires_at_idx"
  ON "TelemetrySpan"("retention_expires_at");

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
