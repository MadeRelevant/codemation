-- CreateTable
CREATE TABLE "WorkflowDebuggerOverlay" (
    "workflow_id" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "copied_from_run_id" TEXT,
    "state_json" TEXT NOT NULL,

    CONSTRAINT "WorkflowDebuggerOverlay_pkey" PRIMARY KEY ("workflow_id")
);
