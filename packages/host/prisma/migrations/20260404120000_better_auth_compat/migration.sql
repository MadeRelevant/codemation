-- Better Auth compatibility: timestamps, session metadata, boolean email_verified, verification id PK.

-- User: timestamps + email_verified boolean (from legacy nullable timestamp)
ALTER TABLE "codemation_auth_user" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "codemation_auth_user" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "codemation_auth_user" ADD COLUMN "email_verified_new" BOOLEAN NOT NULL DEFAULT false;
UPDATE "codemation_auth_user" SET "email_verified_new" = ("email_verified" IS NOT NULL);
ALTER TABLE "codemation_auth_user" DROP COLUMN "email_verified";
ALTER TABLE "codemation_auth_user" RENAME COLUMN "email_verified_new" TO "email_verified";

-- Session
ALTER TABLE "codemation_auth_session" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "codemation_auth_session" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "codemation_auth_session" ADD COLUMN "ip_address" TEXT;
ALTER TABLE "codemation_auth_session" ADD COLUMN "user_agent" TEXT;

-- Account
ALTER TABLE "codemation_auth_account" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "codemation_auth_account" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "codemation_auth_account" ADD COLUMN "access_token_expires_at" TIMESTAMP(3);
ALTER TABLE "codemation_auth_account" ADD COLUMN "refresh_token_expires_at" TIMESTAMP(3);
UPDATE "codemation_auth_account"
SET "access_token_expires_at" = to_timestamp("expires_at")
WHERE "expires_at" IS NOT NULL AND "access_token_expires_at" IS NULL;

-- VerificationToken: add surrogate id + timestamps (rebuild for PK)
CREATE TABLE "codemation_auth_verification_token_new" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codemation_auth_verification_token_new_pkey" PRIMARY KEY ("id")
);
INSERT INTO "codemation_auth_verification_token_new" ("id", "identifier", "token", "expires")
SELECT gen_random_uuid()::text, "identifier", "token", "expires" FROM "codemation_auth_verification_token";
DROP TABLE "codemation_auth_verification_token";
ALTER TABLE "codemation_auth_verification_token_new" RENAME TO "codemation_auth_verification_token";
CREATE UNIQUE INDEX "codemation_auth_verification_token_identifier_token_key" ON "codemation_auth_verification_token"("identifier", "token");
