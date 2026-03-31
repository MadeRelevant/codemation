# Codemation starter (minimal template)

Smaller surface than the default template; same runtime requirements.

1. `.env` is created for you with zero-setup defaults: **PGlite** (`.codemation/pglite`) plus local-development auth and credential-encryption keys.
2. `pnpm install`
3. `pnpm exec codemation db migrate`
4. `pnpm exec codemation user create --email you@example.com --password 'your-password'`
5. `pnpm dev`

Optional: edit `.env` to use TCP PostgreSQL or `REDIS_URL` for BullMQ + Redis. BullMQ requires `DATABASE_URL` (PostgreSQL, not PGlite).
