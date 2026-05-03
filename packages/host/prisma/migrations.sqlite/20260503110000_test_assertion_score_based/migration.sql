-- Refactor TestAssertion to a score-based contract (SQLite).
-- The framework is pre-release (no users yet) — wiping existing rows is preferred over a
-- delicate backfill, per product owner. Pass/fail is now derived at read-time from
-- `score >= (pass_threshold ?? 0.5)` (with `errored=true` always treated as fail).
--
-- SQLite ALTER TABLE doesn't support DROP COLUMN reliably across versions and can't change
-- nullability, so we rebuild the table. Existing rows are dropped (DELETE before rename).

DELETE FROM "TestAssertion";

PRAGMA foreign_keys=OFF;

CREATE TABLE "TestAssertion_new" (
  "id"                TEXT PRIMARY KEY,
  "run_id"            TEXT NOT NULL,
  "test_suite_run_id" TEXT NOT NULL,
  "workflow_id"       TEXT NOT NULL,
  "node_id"           TEXT NOT NULL,
  "iteration_id"      TEXT,
  "item_index"        INTEGER,
  "name"              TEXT NOT NULL,
  "score"             REAL NOT NULL,
  "pass_threshold"    REAL,
  "errored"           BOOLEAN NOT NULL DEFAULT false,
  "expected_json"     TEXT,
  "actual_json"       TEXT,
  "message"           TEXT,
  "details_json"      TEXT,
  "created_at"        TEXT NOT NULL,
  FOREIGN KEY ("run_id") REFERENCES "Run"("run_id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("test_suite_run_id") REFERENCES "TestSuiteRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DROP TABLE "TestAssertion";
ALTER TABLE "TestAssertion_new" RENAME TO "TestAssertion";

CREATE INDEX "TestAssertion_test_suite_run_id_created_at_idx" ON "TestAssertion"("test_suite_run_id", "created_at");
CREATE INDEX "TestAssertion_run_id_created_at_idx" ON "TestAssertion"("run_id", "created_at");
CREATE INDEX "TestAssertion_node_id_idx" ON "TestAssertion"("node_id");

PRAGMA foreign_keys=ON;
