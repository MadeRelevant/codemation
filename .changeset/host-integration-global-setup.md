---
"@codemation/host": patch
---

Integration tests: provision one shared Postgres in Vitest global setup when `DATABASE_URL` is unset (avoids per-suite Testcontainers flakes), with a cross-process lock when host and CLI integration projects run global setup together.
