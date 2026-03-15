-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Run" (
    "run_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "started_at" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parent_json" TEXT,
    "execution_options_json" TEXT,
    "updated_at" TEXT NOT NULL,
    "state_json" TEXT NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("run_id")
);
