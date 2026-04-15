CREATE TABLE "RunTraceContext" (
  "run_id" TEXT NOT NULL PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "root_span_id" TEXT NOT NULL,
  "service_name" TEXT,
  "created_at" TEXT NOT NULL,
  CONSTRAINT "RunTraceContext_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RunTraceContext_trace_id_key"
  ON "RunTraceContext"("trace_id");

CREATE INDEX "RunTraceContext_workflow_id_created_at_idx"
  ON "RunTraceContext"("workflow_id", "created_at");

CREATE TABLE "TelemetrySpan" (
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
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "total_tokens" INTEGER,
  "cached_input_tokens" INTEGER,
  "cache_creation_input_tokens" INTEGER,
  "reasoning_tokens" INTEGER,
  "turn_count" INTEGER,
  "tool_call_count" INTEGER,
  "attributes_json" TEXT,
  "events_json" TEXT,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "TelemetrySpan_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

CREATE TABLE "TelemetryArtifact" (
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
  CONSTRAINT "TelemetryArtifact_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TelemetryArtifact_trace_id_created_at_idx"
  ON "TelemetryArtifact"("trace_id", "created_at");

CREATE INDEX "TelemetryArtifact_span_id_created_at_idx"
  ON "TelemetryArtifact"("span_id", "created_at");

CREATE INDEX "TelemetryArtifact_run_id_created_at_idx"
  ON "TelemetryArtifact"("run_id", "created_at");
