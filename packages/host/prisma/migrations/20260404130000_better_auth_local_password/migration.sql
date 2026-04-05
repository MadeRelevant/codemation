-- Local email/password via Better Auth: credential account password column + legacy type default + backfill from User.passwordHash.

ALTER TABLE "codemation_auth_account" ADD COLUMN "password" TEXT;

ALTER TABLE "codemation_auth_account" ALTER COLUMN "type" SET DEFAULT 'oauth';

INSERT INTO "codemation_auth_account" ("id", "user_id", "type", "provider", "provider_account_id", "password", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  u."id",
  'oauth',
  'credential',
  u."id",
  u."password_hash",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "codemation_auth_user" u
WHERE u."password_hash" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "codemation_auth_account" a
    WHERE a."user_id" = u."id" AND a."provider" = 'credential'
  );
