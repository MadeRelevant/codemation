# Core systems regroup inventory

This file tracks what is actually true while the `packages/core` systems-first regroup is in progress.
It is intentionally conservative: if the package still reads as `engine/` first, the work is not done yet.

## Status

| Area                         | Status                         | Notes                                                                                                                                                       |
| ---------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behavior coverage            | done enough to refactor safely | Runtime/intents/persisted/planner scenario coverage exists and should remain the regression net.                                                            |
| Bootstrap cleanup            | done                           | Composition and runtime wiring now live under `src/bootstrap/` and `src/bootstrap/runtime/`.                                                                |
| Systems-first package layout | done                           | `src/engine/` has been removed; `src/` now reads as top-level systems.                                                                                      |
| Smaller public API           | done                           | `src/index.ts` uses explicit exports, old catalog/store compatibility aliases are removed, and advanced runtime wiring stays behind secondary entry points. |
| Consolidation of micro-parts | partial                        | The physical regroup is done, but some subsystem internals still merit further consolidation.                                                               |

## Current status

The physical regroup is now in place:

- `workflow-builder/` has moved under `workflow/dsl/`.
- workflow definition helpers now live under `workflow/definition/` and `workflow/graph/`.
- `orchestration/` now carries the engine facade and long-lived run coordination flow.
- runtime-facing orchestration lives under `runtime/`.
- execution, planning, policies, workflow snapshots, run storage, binaries, schedulers, and serialization each live in their own top-level systems.
- `src/engine/` has been removed instead of retained as a compatibility layer.

## Target top-level systems

The intended top-level package shape is:

- `workflow/`
- `orchestration/`
- `runtime/`
- `execution/`
- `planning/`
- `workflowSnapshots/`
- `policies/`
- `runStorage/`
- `scheduler/`
- `serialization/`
- `binaries/`
- `events/`
- `bootstrap/`
- `testing/`

There is no remaining `src/engine/` directory in the active source layout.

## Directory mapping

| Current location                                                                                                 | Target system                                   |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/workflow-builder/`                                                                                          | `src/workflow/dsl/`                             |
| `src/workflow/`                                                                                                  | `src/workflow/definition/`                      |
| `src/engine/api/`, `src/engine/intents/`, `src/engine/workflows/`, `src/engine/triggers/`, `src/engine/waiters/` | `src/runtime/`                                  |
| `src/engine/runtime/`                                                                                            | `src/bootstrap/runtime/`                        |
| `src/engine/execution/`                                                                                          | `src/execution/`                                |
| `src/engine/planning/`                                                                                           | `src/planning/`                                 |
| `src/engine/materialization/`                                                                                    | `src/workflowSnapshots/`                        |
| `src/engine/policies/`                                                                                           | `src/policies/`                                 |
| `src/engine/storage/`                                                                                            | `src/runStorage/`                               |
| `src/engine/state/`                                                                                              | `src/execution/`                                |
| `src/engine/binaries/`                                                                                           | `src/binaries/`                                 |
| `src/engine/context/`, `src/engine/credentials/`                                                                 | `src/execution/`                                |
| `src/engine/graph/`                                                                                              | `src/workflow/graph/`                           |
| legacy in-memory live-workflow adapter under `src/engine/adapters/catalog/`                                      | `src/runtime/InMemoryLiveWorkflowRepository.ts` |

## Public API target

The package surfaces should converge toward:

- `@codemation/core`
  - workflow DSL
  - stable contracts/types
  - only intentionally supported runtime entrypoints
- `@codemation/core/bootstrap`
  - advanced composition root and runtime registration
- `@codemation/core/testing`
  - test-only helpers and fakes

Legacy catalog/store compatibility aliases should be removed so both internal code and public surfaces use the repository-based names consistently.

The following should stop being part of the general main barrel:

- container DI bridges
- runtime registration and matcher wiring
- in-memory stores and similar implementation helpers
- policy evaluators and other advanced internal engine pieces

## Migration rules

- Prefer cohesive subsystem files over tiny registration wrappers.
- Merge thin helper classes when they have no meaningful independent seam.
- Keep compatibility shims only as long as monorepo imports still need migration.
- Update tests and internal consumers alongside moves so the new layout becomes the real layout, not just an extra alias layer.

## Validation contract

- Existing Vitest suites remain the regression net.
- Add focused coverage only when a move reveals an unprotected behavior.
- Finish the regroup with typecheck, build, tests, lint, and coverage on the touched packages.
