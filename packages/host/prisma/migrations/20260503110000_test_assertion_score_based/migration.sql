-- Refactor TestAssertion to a score-based contract.
-- The framework is pre-release (no users yet) — wiping existing rows is preferred over a
-- delicate backfill, per product owner. Pass/fail is now derived at read-time from
-- `score >= (pass_threshold ?? 0.5)` (with `errored=true` always treated as fail).
--
--   - drop column "status"
--   - "score" becomes NOT NULL (was nullable)
--   - add "pass_threshold" (nullable, defaults to 0.5 in app code when null)
--   - add "errored" (boolean, default false)

DELETE FROM "TestAssertion";

ALTER TABLE "TestAssertion" DROP COLUMN "status";
ALTER TABLE "TestAssertion" ALTER COLUMN "score" SET NOT NULL;
ALTER TABLE "TestAssertion" ADD COLUMN "pass_threshold" DOUBLE PRECISION;
ALTER TABLE "TestAssertion" ADD COLUMN "errored" BOOLEAN NOT NULL DEFAULT false;
