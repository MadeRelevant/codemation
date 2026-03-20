-- AlterTable
ALTER TABLE "codemation_auth_user" ADD COLUMN "account_status" TEXT NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "codemation_auth_user_invite" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "codemation_auth_user_invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "codemation_auth_user_invite_token_hash_key" ON "codemation_auth_user_invite"("token_hash");

CREATE INDEX "codemation_auth_user_invite_user_id_idx" ON "codemation_auth_user_invite"("user_id");

ALTER TABLE "codemation_auth_user_invite" ADD CONSTRAINT "codemation_auth_user_invite_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "codemation_auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
