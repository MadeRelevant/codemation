# Codemation starter (default template)

## Quick start

1. **Environment** — Copy `.env.example` to `.env` and set `DATABASE_URL` (PostgreSQL). Optionally set `REDIS_URL` for BullMQ + Redis (scheduler and event bus); otherwise the app uses local/in-memory modes for development.

2. **Dependencies** — `npm install` or `pnpm install`.

3. **First admin user** — After migrations (`npm exec codemation -- db migrate`), create a user:
   `npm exec codemation -- user create --email you@example.com --password 'your-secure-password'`

4. **Run** — `npm run dev` (starts `codemation dev`).

If you used `npm create codemation`, you may have been prompted to run migrations and create a user automatically; otherwise follow the steps above.
