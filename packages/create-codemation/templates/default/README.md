# Codemation starter (default template)

## Quick start

1. **Environment** — `.env` is created for you with zero-setup defaults: **embedded Postgres (PGlite)** under `.codemation/pglite`, plus local-development auth and credential-encryption keys. You do not need `DATABASE_URL` unless you switch to TCP PostgreSQL. Optionally set `REDIS_URL` for BullMQ + Redis (scheduler and event bus); when `REDIS_URL` is set you **must** set `DATABASE_URL` to a shared PostgreSQL URL (BullMQ cannot use PGlite).

2. **Dependencies** — `pnpm install`.

   This template already includes `AGENTS.md` and packaged Codemation skills under `.agents/skills/extracted`, so coding agents can pick up project guidance immediately.

3. **First admin user** — After migrations (`pnpm exec codemation db migrate`), create a user:
   `pnpm exec codemation user create --email you@example.com --password 'your-secure-password'`

4. **Run** — `pnpm dev` (starts `codemation dev`).

If you want PostgreSQL or Redis instead of the zero-setup defaults, edit `.env` before running migrations.
