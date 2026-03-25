# `@codemation/cli`

Command-line entry for building consumer output, running the Next host in development, and related tasks.

## Tests

Unit tests live under `test/` and run on Node with Vitest.

```bash
pnpm --filter @codemation/cli test
```

From the repository root they are also included in the shared unit suite:

```bash
pnpm run test:unit
```

### What is covered

- **`ConsumerBuildOptionsParser`**: maps CLI flags (`--no-source-maps`, `--target`) to `ConsumerBuildOptions`.
- **`ConsumerOutputBuilder` + build options**: default build emits `.js.map` files for transpiled workflows; `sourceMaps: false` omits them (production-style bundles).
- **`ConsumerOutputBuilder`**
  - **Full build** (`ensureBuilt`): stages under `.codemation/output/staging/…`, then atomically promotes to `.codemation/output/build/` (writes `index.js` and transpiles discovered workflow sources).
  - **Watch + incremental rebuild**: after a first full build, a filesystem change to a single workflow file triggers a fresh staged build promoted to the same `build/` path; the emitted workflow module updates (real chokidar + debounce; `CHOKIDAR_USEPOLLING` is set in tests for portability).

## Production-oriented build flags

`codemation build` (and `codemation serve web`, which runs the consumer build first) accept:

| Flag                          | Purpose                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `--no-source-maps`            | Omit `.js.map` files next to emitted workflow modules (smaller output, no source-map payloads in the artifact tree). |
| `--target es2020` \| `es2022` | ECMAScript language version for emitted workflow JavaScript (default `es2022`).                                      |

Programmatic use: pass `ConsumerBuildOptions` via `ConsumerOutputBuilder` (third constructor argument) or `ConsumerBuildOptionsParser` for the same mapping as the CLI.

Tests use a temporary consumer fixture (minimal `codemation.config.ts` + `src/workflows`) and do not mock TypeScript transpilation or the host discovery helpers.

The consumer **manifest** (`current.json`) is produced by the CLI publish step (`publishBuildArtifacts`), not by `ensureBuilt` alone; see tests for how the snapshot’s `manifestPath` relates to that.
