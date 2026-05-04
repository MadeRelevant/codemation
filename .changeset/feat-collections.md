---
"@codemation/core": minor
"@codemation/core-nodes": minor
"@codemation/host": minor
"@codemation/next-host": minor
"@codemation/cli": minor
---

Add collections: declare typed Postgres/SQLite-backed data tables in the codemation config via `defineCollection({...})`. Schema sync runs at runtime startup behind an advisory lock (Postgres) or in-process mutex (SQLite).

Workflow access:

- `ctx.collections.<name>.crud(...)` from inside custom node code
- Six new canvas nodes: `CollectionInsert`, `CollectionGet`, `CollectionFindOne`, `CollectionList`, `CollectionUpdate`, `CollectionDelete`

Operator surfaces:

- HTTP API at `/collections/*`
- CLI: `codemation collections list|show|rows|get|insert|update|delete|sync`
- UI at `/collections`

Destructive schema changes (column drops, type changes) require `CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE=1`.

Out of scope (separate PRs):

- Real leader election (advisory lock at boot is sufficient for sync; trigger double-firing during container swap is unaddressed)
- Admin-role gating on the UI
- Runtime user-defined schemas (Airtable-style)
- Joins, aggregates, query DSL beyond indexed-field equality
