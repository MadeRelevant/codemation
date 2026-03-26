# Codemation starter (minimal template)

Smaller surface than the default template; same runtime requirements.

1. Copy `.env.example` to `.env` and set `DATABASE_URL` (PostgreSQL).
2. `npm install` or `pnpm install`
3. `npm exec codemation -- db migrate`
4. `npm exec codemation -- user create --email you@example.com --password 'your-password'`
5. `npm run dev`

Optional: `REDIS_URL` for BullMQ + Redis. Omit for local/in-memory dev modes.
