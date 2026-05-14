---
"@codemation/create-codemation": minor
"@codemation/host": minor
---

Add `managed` scaffold template and workflow auto-discovery config fields

- New `create-codemation` template `managed` — pre-configured for managed mode with PostgreSQL, CP-JWT auth, and workflow auto-discovery from `./src/workflows`.
- `defineCodemationApp` now accepts `workflowsDir` (maps to `workflowDiscovery.directories`), `database.urlEnv`, `execution.modeEnv`, and `execution.redisUrlEnv` for env-resolved config values.
- `CodemationConfigNormalizer` enforces managed-mode invariants: PostgreSQL required, at least one workflow source required.
- New `WorkflowDirectoryDiscoverer` class for walking a directory and collecting exported workflows with test-file exclusion.
- `WorkflowModulePathFinder` now excludes `*.test.*` and `*.spec.*` files from discovery.
