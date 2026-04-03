# Local Verdaccio Registry

Use this when you want to consume Codemation packages like a real published release without touching npmjs.

## Persistent workflow

1. Start the local registry:

```bash
pnpm run verdaccio
```

2. Publish the current workspace packages into it:

```bash
pnpm run local-release:publish
```

3. Point a consumer app at the local registry with an `.npmrc`:

```ini
registry=http://127.0.0.1:4873/
@codemation:registry=http://127.0.0.1:4873/
//127.0.0.1:4873/:_authToken=codemation-local-registry-token
```

4. Use the packages as if they came from npmjs:

```bash
pnpm dlx create-codemation@0.0.3 my-app --template default --yes
cd my-app
pnpm install
pnpm dev
```

If you prefer `npm create`, run it from a directory with the same `.npmrc` in place.

## Smoke gate

Use this before any real npm publish:

```bash
pnpm run local-release:smoke
```

That command starts an isolated temporary Verdaccio instance, publishes the local Codemation packages into it, scaffolds a fresh app from the registry, installs dependencies, runs migrations, creates a user, and verifies `codemation dev` boots successfully.

## Notes

- `pnpm run local-release:publish` builds the publishable packages before publishing them in dependency order.
- The persistent Verdaccio config lives in `tooling/verdaccio/config.yaml`.
- The temporary smoke registry is separate and cleans itself up after each run.
- Local Verdaccio storage under `.verdaccio/` is gitignored. Delete it if you want to reset the persistent registry.
