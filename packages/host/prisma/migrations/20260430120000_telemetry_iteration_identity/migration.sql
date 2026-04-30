-- Add per-item iteration identity columns to telemetry tables.
-- See docs in @codemation/host telemetry attribute names: codemation.iteration.id,
-- codemation.iteration.index, codemation.parent.invocation_id.

ALTER TABLE "TelemetrySpan"
  ADD COLUMN "iteration_id" TEXT,
  ADD COLUMN "item_index" INTEGER,
  ADD COLUMN "parent_invocation_id" TEXT;

CREATE INDEX "TelemetrySpan_iteration_id_idx" ON "TelemetrySpan"("iteration_id");

ALTER TABLE "TelemetryMetricPoint"
  ADD COLUMN "iteration_id" TEXT,
  ADD COLUMN "item_index" INTEGER,
  ADD COLUMN "parent_invocation_id" TEXT;

CREATE INDEX "TelemetryMetricPoint_iteration_id_idx" ON "TelemetryMetricPoint"("iteration_id");
