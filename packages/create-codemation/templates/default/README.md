# Codemation starter (default template)

## Quick start

1. **Environment** — Copy `.env.example` to `.env`. By default the app uses **embedded Postgres (PGlite)** under `.codemation/pglite`; you do not need `DATABASE_URL` unless you switch to TCP PostgreSQL. Optionally set `REDIS_URL` for BullMQ + Redis (scheduler and event bus); when `REDIS_URL` is set you **must** set `DATABASE_URL` to a shared PostgreSQL URL (BullMQ cannot use PGlite).

2. **Dependencies** — `npm install` or `pnpm install`.

3. **First admin user** — After migrations (`npm exec codemation -- db migrate`), create a user:
   `npm exec codemation -- user create --email you@example.com --password 'your-secure-password'`

4. **Run** — `npm run dev` (starts `codemation dev`).

If you used `npm create codemation`, you may have been prompted to run migrations and create a user automatically; otherwise follow the steps above.
