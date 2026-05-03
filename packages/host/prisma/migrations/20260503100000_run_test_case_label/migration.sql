-- Add test_case_label to Run (Postgres). Populated by PrismaWorkflowRunRepository from
-- executionOptions.testContext.testCaseLabel — set by TestSuiteOrchestrator from the
-- author's `TestTrigger.caseLabel(item)` resolver. Lets the Tests-tab tree-table show
-- meaningful labels (e.g. an email subject) instead of opaque runIds.

ALTER TABLE "Run" ADD COLUMN "test_case_label" TEXT;
