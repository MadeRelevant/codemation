-- Better Auth compatibility (SQLite): timestamps, session metadata, boolean email_verified, verification id PK.

ALTER TABLE "codemation_auth_user" ADD COLUMN "created_at" DATETIME NOT NULL DEFAULT (datetime('now'));
ALTER TABLE "codemation_auth_user" ADD COLUMN "updated_at" DATETIME NOT NULL DEFAULT (datetime('now'));
ALTER TABLE "codemation_auth_user" ADD COLUMN "email_verified_new" INTEGER NOT NULL DEFAULT 0;
UPDATE "codemation_auth_user" SET "email_verified_new" = CASE WHEN "email_verified" IS NOT NULL THEN 1 ELSE 0 END;
ALTER TABLE "codemation_auth_user" DROP COLUMN "email_verified";
ALTER TABLE "codemation_auth_user" RENAME COLUMN "email_verified_new" TO "email_verified";

ALTER TABLE "codemation_auth_session" ADD COLUMN "created_at" DATETIME NOT NULL DEFAULT (datetime('now'));
ALTER TABLE "codemation_auth_session" ADD COLUMN "updated_at" DATETIME NOT NULL DEFAULT (datetime('now'));
ALTER TABLE "codemation_auth_session" ADD COLUMN "ip_address" TEXT;
ALTER TABLE "codemation_auth_session" ADD COLUMN "user_agent" TEXT;

ALTER TABLE "codemation_auth_account" ADD COLUMN "created_at" DATETIME NOT NULL DEFAULT (datetime('now'));
ALTER TABLE "codemation_auth_account" ADD COLUMN "updated_at" DATETIME NOT NULL DEFAULT (datetime('now'));
ALTER TABLE "codemation_auth_account" ADD COLUMN "access_token_expires_at" DATETIME;
ALTER TABLE "codemation_auth_account" ADD COLUMN "refresh_token_expires_at" DATETIME;

CREATE TABLE "codemation_auth_verification_token_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updated_at" DATETIME NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "codemation_auth_verification_token_new" ("id", "identifier", "token", "expires")
SELECT lower(hex(randomblob(16))) || lower(hex(randomblob(8))), "identifier", "token", "expires" FROM "codemation_auth_verification_token";
DROP TABLE "codemation_auth_verification_token";
ALTER TABLE "codemation_auth_verification_token_new" RENAME TO "codemation_auth_verification_token";
CREATE UNIQUE INDEX "codemation_auth_verification_token_identifier_token_key" ON "codemation_auth_verification_token"("identifier", "token");
