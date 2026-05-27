-- Migration: Durable HMAC nonce store for replay protection (T6 security fix).
-- Replaces the in-memory Map in IncomingHmacVerifier with a Prisma-backed store
-- so replay protection survives process restarts within the 300-second window.

CREATE TABLE "hmac_nonce" (
    "nonce"      TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hmac_nonce_pkey" PRIMARY KEY ("nonce")
);

CREATE INDEX "hmac_nonce_expires_at_idx" ON "hmac_nonce"("expires_at");
