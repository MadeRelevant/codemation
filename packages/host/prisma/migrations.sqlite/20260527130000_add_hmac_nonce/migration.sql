-- Migration: Durable HMAC nonce store for replay protection (T6 security fix, SQLite variant).
-- Mirrors the PostgreSQL migration but uses TEXT for the timestamp column (SQLite has no native TIMESTAMP type).

CREATE TABLE "hmac_nonce" (
    "nonce"      TEXT NOT NULL PRIMARY KEY,
    "expires_at" DATETIME NOT NULL
);

CREATE INDEX "hmac_nonce_expires_at_idx" ON "hmac_nonce"("expires_at");
