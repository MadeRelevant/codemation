# Engine refactor inventory (checkpoint)

This snapshot records the **north-star layout** for `packages/core`’s engine module, what is **in place**, and **transitional seams** to watch after the refactor.

## Target layout (north star)

| Area | Role |
|------|------|
| `src/engine/api/` | Public façade: `Engine`, `EngineFactory`, composition types (`EngineCompositionDeps`). |
| `src/engine/application/` | Orchestration: execution, triggers, intents, state publishing, waiters, planning glue. |
| `src/engine/domain/` | Pure logic: planning structures, snapshot/continuation helpers, port-style types used by application code. |
| `src/engine/adapters/` | Infrastructure-style implementations: DI helpers, webhooks, credentials, persisted-workflow materialization, in-memory registry (tests use `@codemation/core/testing`). |
| `src/contracts/` | Ports and shared engine contracts (`EngineDeps`, `WorkflowRepository`, `WorkflowCatalog`, …). |

**Workflow loading:** read paths use `WorkflowRepository`; mutable discovery/sync uses `WorkflowCatalog` (`CoreTokens.WorkflowCatalog`). `CoreTokens.WorkflowRegistry` remains a compatibility alias to the same instance. Host owns `LiveWorkflowCatalog`.

**Persisted workflows:** materialization stays inside `EngineFactory` (with optional overrides on `EngineCompositionDeps` for tests). `PersistedWorkflowSnapshotFactory` for tests lives under `@codemation/core/testing`.

## Current directory map (engine)

```
engine/
  api/              Engine, EngineFactory
  application/      execution, intents, triggers, state, waiters, planning, workflows, …
  domain/           planning, execution (pure helpers)
  adapters/         di, credentials, nodes, persisted-workflow, registry, webhooks, …
  context/          execution context helpers
  graph/            workflow graph defaults
  scheduling/       schedulers, offload policies
  storage/          in-memory run store, binary, mappers
```

The former `engine/runtime/` shim tree was **removed**; barrels and call sites import canonical modules under `api/`, `application/`, `domain/`, and `adapters/`.

## North star vs transitional

| Topic | Status |
|-------|--------|
| Thin `Engine` façade | **Done** — delegates to injected services. |
| `EngineFactory` as composition root | **Done** — internal persisted-workflow services constructed here; optional overrides on `EngineCompositionDeps`. |
| `WorkflowRepository` / `WorkflowCatalog` split | **Done** — contracts + `CoreTokens.WorkflowCatalog` primary registration. |
| Test-only in-memory workflow catalog | **Done** — `InMemoryWorkflowRegistry` via `@codemation/core/testing`. |
| Public barrel hygiene | **Done** — missing-runtime markers / snapshot factory removed from main export; snapshot factory re-exported from testing entry only. |
| Runtime re-export shims | **Done** — `engine/runtime/` removed. |

## Remaining seams (low priority)

- **`CoreTokens.WorkflowRegistry`** — kept as a deprecated alias; can be removed in a future major if consumers migrate to `WorkflowCatalog`.
- **Docs / skills** — a few repo docs still say “engine/runtime”; update when those files are touched.
- **Optional:** rename `synchronizeWorkflowRegistry` in host to `synchronizeWorkflowCatalog` for naming consistency (behavior unchanged).

## Tooling notes

- **`@codemation/core/testing`** is mapped in `tsconfig.base.json` (and `packages/next-host/tsconfig.json`) so TypeScript does not treat `…/core/testing` as a path under the main `index.ts` stub.
- **Host Vitest** (`packages/host/vitest.shared.ts`) adds a resolve alias for `@codemation/core/testing` *before* `@codemation/core`, matching the same constraint for Vite’s resolver.
