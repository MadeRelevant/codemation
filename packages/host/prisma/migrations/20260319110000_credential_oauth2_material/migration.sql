CREATE TABLE "CredentialOAuth2Material" (
  "instance_id" TEXT NOT NULL,
  "encrypted_json" TEXT NOT NULL,
  "encryption_key_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "provider_id" TEXT NOT NULL,
  "connected_email" TEXT,
  "connected_at" TEXT,
  "scopes_json" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,

  CONSTRAINT "CredentialOAuth2Material_pkey" PRIMARY KEY ("instance_id")
);

CREATE TABLE "CredentialOAuth2State" (
  "state" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "code_verifier" TEXT,
  "provider_id" TEXT,
  "requested_scopes_json" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,

  CONSTRAINT "CredentialOAuth2State_pkey" PRIMARY KEY ("state")
);

CREATE INDEX "CredentialOAuth2State_instance_id_idx" ON "CredentialOAuth2State"("instance_id");
CREATE INDEX "CredentialOAuth2State_expires_at_idx" ON "CredentialOAuth2State"("expires_at");
