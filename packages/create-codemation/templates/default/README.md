# Codemation starter

1. Copy `.env.example` to `.env` and set `DATABASE_URL` (PostgreSQL).
2. Install dependencies: `pnpm install` / `npm install`.
3. Run: `pnpm dev` / `npm run dev` (starts `codemation dev`).

Optional: set `REDIS_URL` to use BullMQ + Redis for the scheduler and event bus; otherwise the app uses in-memory / local modes suitable for development.
