CREATE TABLE "TriggerSetupState" (
    "workflow_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "state_json" TEXT NOT NULL,

    CONSTRAINT "TriggerSetupState_pkey" PRIMARY KEY ("workflow_id","node_id")
);
