-- Test-suite persistence (SQLite).
-- Adds two new tables for tracking workflow test runs:
--   - TestSuiteRun: one row per execution of a TestTrigger node (fan-out parent).
--   - TestAssertion: one row per assertion emitted by an `emitsAssertions: true` node.
-- Plus: nullable links on the existing Run table so each test case run joins back to its suite.

ALTER TABLE "Run" ADD COLUMN "test_suite_run_id" TEXT REFERENCES "TestSuiteRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Run" ADD COLUMN "test_case_index" INTEGER;

CREATE INDEX "Run_test_suite_run_id_test_case_index_idx" ON "Run"("test_suite_run_id", "test_case_index");

CREATE TABLE "TestSuiteRun" (
  "id"                  TEXT PRIMARY KEY,
  "workflow_id"         TEXT NOT NULL,
  "trigger_node_id"     TEXT NOT NULL,
  "trigger_node_name"   TEXT,
  "status"              TEXT NOT NULL,
  "concurrency"         INTEGER NOT NULL,
  "started_at"          TEXT NOT NULL,
  "finished_at"         TEXT,
  "total_cases"         INTEGER NOT NULL DEFAULT 0,
  "passed_cases"        INTEGER NOT NULL DEFAULT 0,
  "failed_cases"        INTEGER NOT NULL DEFAULT 0,
  "node_coverage_json"  TEXT,
  "error_message"       TEXT,
  "updated_at"          TEXT NOT NULL
);

CREATE INDEX "TestSuiteRun_workflow_id_started_at_idx" ON "TestSuiteRun"("workflow_id", "started_at");
CREATE INDEX "TestSuiteRun_workflow_id_trigger_node_id_started_at_idx"
  ON "TestSuiteRun"("workflow_id", "trigger_node_id", "started_at");
CREATE INDEX "TestSuiteRun_status_finished_at_idx" ON "TestSuiteRun"("status", "finished_at");

CREATE TABLE "TestAssertion" (
  "id"                TEXT PRIMARY KEY,
  "run_id"            TEXT NOT NULL,
  "test_suite_run_id" TEXT NOT NULL,
  "workflow_id"       TEXT NOT NULL,
  "node_id"           TEXT NOT NULL,
  "iteration_id"      TEXT,
  "item_index"        INTEGER,
  "name"              TEXT NOT NULL,
  "status"            TEXT NOT NULL,
  "score"             REAL,
  "expected_json"     TEXT,
  "actual_json"       TEXT,
  "message"           TEXT,
  "details_json"      TEXT,
  "created_at"        TEXT NOT NULL,
  FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("test_suite_run_id") REFERENCES "TestSuiteRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TestAssertion_test_suite_run_id_created_at_idx" ON "TestAssertion"("test_suite_run_id", "created_at");
CREATE INDEX "TestAssertion_run_id_created_at_idx" ON "TestAssertion"("run_id", "created_at");
CREATE INDEX "TestAssertion_node_id_idx" ON "TestAssertion"("node_id");
