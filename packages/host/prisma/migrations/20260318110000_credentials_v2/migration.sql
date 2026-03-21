CREATE TABLE "CredentialInstance" (
  "instance_id" TEXT NOT NULL,
  "type_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "source_kind" TEXT NOT NULL,
  "public_config_json" TEXT NOT NULL,
  "secret_ref_json" TEXT NOT NULL,
  "tags_json" TEXT NOT NULL,
  "setup_status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,

  CONSTRAINT "CredentialInstance_pkey" PRIMARY KEY ("instance_id")
);

CREATE TABLE "CredentialSecretMaterial" (
  "instance_id" TEXT NOT NULL,
  "encrypted_json" TEXT NOT NULL,
  "encryption_key_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "updated_at" TEXT NOT NULL,

  CONSTRAINT "CredentialSecretMaterial_pkey" PRIMARY KEY ("instance_id")
);

CREATE TABLE "CredentialBinding" (
  "workflow_id" TEXT NOT NULL,
  "node_id" TEXT NOT NULL,
  "slot_key" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,

  CONSTRAINT "CredentialBinding_pkey" PRIMARY KEY ("workflow_id", "node_id", "slot_key")
);

CREATE TABLE "CredentialTestResult" (
  "test_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "details_json" TEXT NOT NULL,
  "tested_at" TEXT NOT NULL,
  "expires_at" TEXT,

  CONSTRAINT "CredentialTestResult_pkey" PRIMARY KEY ("test_id")
);

CREATE INDEX "CredentialBinding_instance_id_idx" ON "CredentialBinding"("instance_id");
CREATE INDEX "CredentialTestResult_instance_id_tested_at_idx" ON "CredentialTestResult"("instance_id", "tested_at");
