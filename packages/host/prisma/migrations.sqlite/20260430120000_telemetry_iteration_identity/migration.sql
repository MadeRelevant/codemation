-- Add per-item iteration identity columns to telemetry tables (SQLite).
-- See @codemation/host telemetry attribute names: codemation.iteration.id,
-- codemation.iteration.index, codemation.parent.invocation_id.
ALTER TABLE "TelemetrySpan" ADD COLUMN "iteration_id" TEXT;
ALTER TABLE "TelemetrySpan" ADD COLUMN "item_index" INTEGER;
ALTER TABLE "TelemetrySpan" ADD COLUMN "parent_invocation_id" TEXT;

CREATE INDEX "TelemetrySpan_iteration_id_idx" ON "TelemetrySpan"("iteration_id");

ALTER TABLE "TelemetryMetricPoint" ADD COLUMN "iteration_id" TEXT;
ALTER TABLE "TelemetryMetricPoint" ADD COLUMN "item_index" INTEGER;
ALTER TABLE "TelemetryMetricPoint" ADD COLUMN "parent_invocation_id" TEXT;

CREATE INDEX "TelemetryMetricPoint_iteration_id_idx" ON "TelemetryMetricPoint"("iteration_id");
