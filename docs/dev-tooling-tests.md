# Dev tooling tests (`@codemation/cli`, `@codemation/runtime-dev`)

The CLI and runtime-dev packages have **Vitest** unit tests intended for day-to-day confidence when changing consumer builds or the dev runtime.

| Package | README | Focus |
|--------|--------|--------|
| `@codemation/cli` | [packages/cli/README.md](../packages/cli/README.md) | Consumer output builder: full build + watch/incremental rebuild |
| `@codemation/runtime-dev` | [packages/runtime-dev/README.md](../packages/runtime-dev/README.md) | Route guard + dev metrics (no full Vite stack in unit tests) |

## Running them

- **All unit suites** (includes these projects): `pnpm run test:unit` from the repo root (see `tooling/vitest/unit.config.ts`).
- **Per package**: `pnpm --filter @codemation/cli test` or `pnpm --filter @codemation/runtime-dev test`.

See [Development modes](./development-modes.md) for how `codemation dev` fits the broader workflow.
