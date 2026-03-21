-- Auth.js directory tables (JWT session strategy; optional DB sessions for adapter)

CREATE TABLE "codemation_auth_user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "password_hash" TEXT,

    CONSTRAINT "codemation_auth_user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "codemation_auth_user_email_key" ON "codemation_auth_user"("email");

CREATE TABLE "codemation_auth_account" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "codemation_auth_account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "codemation_auth_account_provider_provider_account_id_key" ON "codemation_auth_account"("provider", "provider_account_id");

CREATE TABLE "codemation_auth_session" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "codemation_auth_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "codemation_auth_session_session_token_key" ON "codemation_auth_session"("session_token");

CREATE TABLE "codemation_auth_verification_token" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "codemation_auth_verification_token_identifier_token_key" UNIQUE ("identifier", "token")
);

ALTER TABLE "codemation_auth_account" ADD CONSTRAINT "codemation_auth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "codemation_auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "codemation_auth_session" ADD CONSTRAINT "codemation_auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "codemation_auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
