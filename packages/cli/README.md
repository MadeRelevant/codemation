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

- **`CodemationConsumerOutputBuilder`**
  - **Full build** (`ensureBuilt`): emits a revision under `.codemation/output/revisions/`, writes `index.js`, and transpiles discovered workflow sources.
  - **Watch + incremental rebuild**: after a first full build, a filesystem change to a single workflow file triggers a new revision; the emitted workflow module updates (real chokidar + debounce; `CHOKIDAR_USEPOLLING` is set in tests for portability).

Tests use a temporary consumer fixture (minimal `codemation.config.ts` + `src/workflows`) and do not mock TypeScript transpilation or the host discovery helpers.

The consumer **manifest** (`current.json`) is produced by the CLI publish step (`publishBuildArtifacts`), not by `ensureBuilt` alone; see tests for how the snapshot’s `manifestPath` relates to that.
