-- CreateTable
CREATE TABLE "WorkflowActivation" (
    "workflow_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "WorkflowActivation_pkey" PRIMARY KEY ("workflow_id")
);
