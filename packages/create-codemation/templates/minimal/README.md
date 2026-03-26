# Codemation starter (minimal template)

Smaller surface than the default template; same runtime requirements.

1. Copy `.env.example` to `.env`. Default persistence is **PGlite** (`.codemation/pglite`); add `DATABASE_URL` only if you use TCP PostgreSQL.
2. `npm install` or `pnpm install`
3. `npm exec codemation -- db migrate`
4. `npm exec codemation -- user create --email you@example.com --password 'your-password'`
5. `npm run dev`

Optional: `REDIS_URL` for BullMQ + Redis — requires `DATABASE_URL` (PostgreSQL, not PGlite). Omit both for local/in-memory dev modes.
