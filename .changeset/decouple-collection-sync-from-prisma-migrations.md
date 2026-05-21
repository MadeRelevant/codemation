---
"@codemation/host": patch
---

Fix `/collections` 500 on consumer dev startup: `no such table: collections_<name>`. The CLI sets `CODEMATION_SKIP_STARTUP_MIGRATIONS=true` because it runs Prisma migrations ahead of the runtime, but the same env var was also gating consumer-defined collection-schema sync inside `FrontendRuntime.start` (and `WorkerRuntime.start`). Only the runtime knows about collections declared in `codemation.config.ts`, so the CLI can never run that sync on the runtime's behalf. The two gates are now separate: Prisma migrations remain skip-able via the env var, but collection sync always runs at runtime startup when collections are declared and persistence is configured.
