-- Local email/password via Better Auth: credential account password column + backfill from User.password_hash.

ALTER TABLE "codemation_auth_account" ADD COLUMN "password" TEXT;

INSERT INTO "codemation_auth_account" ("id", "user_id", "type", "provider", "provider_account_id", "password", "created_at", "updated_at")
SELECT
  lower(hex(randomblob(16))) || lower(hex(randomblob(8))),
  u."id",
  'oauth',
  'credential',
  u."id",
  u."password_hash",
  datetime('now'),
  datetime('now')
FROM "codemation_auth_user" u
WHERE u."password_hash" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "codemation_auth_account" a
    WHERE a."user_id" = u."id" AND a."provider" = 'credential'
  );
