---
"@codemation/agent-skills": patch
"@codemation/cli": patch
"@codemation/core-nodes-gmail": patch
"@codemation/host": minor
"@codemation/next-host": patch
"create-codemation": patch
---

Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.
