-- Add test_case_label to Run (SQLite). See postgres mirror for the rationale.

ALTER TABLE "Run" ADD COLUMN "test_case_label" TEXT;
