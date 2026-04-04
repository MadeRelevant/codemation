-- CreateTable
CREATE TABLE "Run" (
    "run_id" TEXT NOT NULL PRIMARY KEY,
    "workflow_id" TEXT NOT NULL,
    "started_at" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parent_json" TEXT,
    "execution_options_json" TEXT,
    "updated_at" TEXT NOT NULL,
    "state_json" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "WorkflowDebuggerOverlay" (
    "workflow_id" TEXT NOT NULL PRIMARY KEY,
    "updated_at" TEXT NOT NULL,
    "copied_from_run_id" TEXT,
    "state_json" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "WorkflowActivation" (
    "workflow_id" TEXT NOT NULL PRIMARY KEY,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TriggerSetupState" (
    "workflow_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "state_json" TEXT NOT NULL,

    PRIMARY KEY ("workflow_id", "node_id")
);

-- CreateTable
CREATE TABLE "CredentialInstance" (
    "instance_id" TEXT NOT NULL PRIMARY KEY,
    "type_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "public_config_json" TEXT NOT NULL,
    "secret_ref_json" TEXT NOT NULL,
    "tags_json" TEXT NOT NULL,
    "setup_status" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CredentialSecretMaterial" (
    "instance_id" TEXT NOT NULL PRIMARY KEY,
    "encrypted_json" TEXT NOT NULL,
    "encryption_key_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CredentialOAuth2Material" (
    "instance_id" TEXT NOT NULL PRIMARY KEY,
    "encrypted_json" TEXT NOT NULL,
    "encryption_key_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "provider_id" TEXT NOT NULL,
    "connected_email" TEXT,
    "connected_at" TEXT,
    "scopes_json" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CredentialOAuth2State" (
    "state" TEXT NOT NULL PRIMARY KEY,
    "instance_id" TEXT NOT NULL,
    "code_verifier" TEXT,
    "provider_id" TEXT,
    "requested_scopes_json" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CredentialBinding" (
    "workflow_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "slot_key" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    PRIMARY KEY ("workflow_id", "node_id", "slot_key")
);

-- CreateTable
CREATE TABLE "CredentialTestResult" (
    "test_id" TEXT NOT NULL PRIMARY KEY,
    "instance_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "details_json" TEXT NOT NULL,
    "tested_at" TEXT NOT NULL,
    "expires_at" TEXT
);

-- CreateTable
CREATE TABLE "codemation_auth_user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "email_verified" DATETIME,
    "image" TEXT,
    "password_hash" TEXT,
    "account_status" TEXT NOT NULL DEFAULT 'active'
);

-- CreateTable
CREATE TABLE "codemation_auth_user_invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL,
    "revoked_at" DATETIME,
    CONSTRAINT "codemation_auth_user_invite_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "codemation_auth_user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "codemation_auth_account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "codemation_auth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "codemation_auth_user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "codemation_auth_session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "codemation_auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "codemation_auth_user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "codemation_auth_verification_token" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CredentialOAuth2State_instance_id_idx" ON "CredentialOAuth2State"("instance_id");

-- CreateIndex
CREATE INDEX "CredentialOAuth2State_expires_at_idx" ON "CredentialOAuth2State"("expires_at");

-- CreateIndex
CREATE INDEX "CredentialBinding_instance_id_idx" ON "CredentialBinding"("instance_id");

-- CreateIndex
CREATE INDEX "CredentialTestResult_instance_id_tested_at_idx" ON "CredentialTestResult"("instance_id", "tested_at");

-- CreateIndex
CREATE UNIQUE INDEX "codemation_auth_user_email_key" ON "codemation_auth_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "codemation_auth_user_invite_token_hash_key" ON "codemation_auth_user_invite"("token_hash");

-- CreateIndex
CREATE INDEX "codemation_auth_user_invite_user_id_idx" ON "codemation_auth_user_invite"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "codemation_auth_account_provider_provider_account_id_key" ON "codemation_auth_account"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "codemation_auth_session_session_token_key" ON "codemation_auth_session"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "codemation_auth_verification_token_identifier_token_key" ON "codemation_auth_verification_token"("identifier", "token");
