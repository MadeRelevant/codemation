-- Add testCaseStatus column to Run table to track per-case test result status
-- (running/succeeded/failed/errored/cancelled), reflecting workflow result + assertion outcomes

ALTER TABLE "Run" ADD COLUMN "test_case_status" TEXT;
