# Dev tooling tests (`@codemation/cli`)

The CLI package has **Vitest** unit tests intended for day-to-day confidence when changing consumer builds or the dev runtime.

| Package           | README                                              | Focus                                                            |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `@codemation/cli` | [packages/cli/README.md](../packages/cli/README.md) | Consumer output builder and in-process dev runtime orchestration |

## Running them

- **All unit suites** (includes these projects): `pnpm run test:unit` from the repo root (see `tooling/vitest/unit.config.ts`).
- **Per package**: `pnpm --filter @codemation/cli test`.

See [Development modes](./development-modes.md) for how `codemation dev` fits the broader workflow.
