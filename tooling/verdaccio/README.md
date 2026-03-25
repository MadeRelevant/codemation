# Local Verdaccio registry

Use this to publish Codemation workspace packages to a **local** registry and validate installs, `npm create codemation`, and consumer apps without the monorepo `workspace:*` links.

## Start Verdaccio

From the repository root:

```bash
pnpm run verdaccio
```

Or with Docker (binds to `127.0.0.1:4873`):

```bash
pnpm exec docker compose -f tooling/verdaccio/docker-compose.yml up -d
```

## Point npm/pnpm at the registry

Create or extend `.npmrc` in the directory where you publish or install:

```
registry=http://localhost:4873/
```

For a **scoped** publish while keeping the public registry for other packages:

```
@codemation:registry=http://localhost:4873/
```

## Publish workspace packages

Packages must be **built** (`dist/`, etc.) before publishing.

Typical flow:

1. `pnpm run build` (or `turbo run build` for the subset you need).
2. If `npm publish` fails with **401 Unauthorized**, create a local user: `npm adduser --registry http://localhost:4873` (Verdaccio ships with the htpasswd plugin; credentials stay in `tooling/verdaccio/htpasswd`, gitignored).
3. Publish in **dependency order** (dependencies before dependents). For example: `@codemation/core` → … → `@codemation/cli` → `create-codemation`.

Use `pnpm publish --filter <pkg> --no-git-checks --registry http://localhost:4873` per package, or automate with a script that respects the graph.

## Install / create against the local registry

```bash
npm create codemation@latest my-app -- --template default --registry http://localhost:4873
```

(Exact flags depend on your npm version; you can also set `registry` in `.npmrc` next to the command.)

## Storage

Tarballs and metadata live under `tooling/verdaccio/storage/` (gitignored). Delete that folder to reset the registry.
