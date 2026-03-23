# Development Modes

Codemation has two distinct development modes. Keeping them separate avoids the confusion where monorepo authoring concerns leak into consumer workflows.

## 1. Framework author mode

Use this when working inside the Codemation monorepo itself.

```bash
pnpm dev
```

This is the same as:

```bash
pnpm run dev:repo
```

What it does:

- warms the build graph for `@codemation/test-dev` and its workspace dependencies so `dist` output exists before anything imports it
- starts `dev` tasks for the framework packages that `@codemation/test-dev` depends on
- starts `@codemation/test-dev`, which in turn runs `codemation dev`
- does **not** start `@codemation/next-host` through Turbo, because the Next.js dev server is owned by the CLI process

Why this still builds `dist` during repo dev:

- parts of the stack still resolve workspace packages through their published entrypoints
- not every runtime in this repo consistently uses the `development` export condition
- keeping `dist` warm is currently the reliable way to make repo-wide edits reflect immediately

The important point is that the package set is derived from the workspace graph:

```bash
pnpm exec turbo run dev --filter=@codemation/test-dev... --filter=!@codemation/next-host --filter=!@codemation/eslint-config
```

That means no hand-maintained shell list of packages is required.

## 2. Consumer mode

Use this when developing a consumer project that uses Codemation, including `apps/test-dev`.

From the consumer root:

```bash
pnpm dev
```

In this repo, `apps/test-dev/package.json` maps that to:

```bash
pnpm exec codemation dev
```

What `codemation dev` does:

- builds the consumer output into `.codemation/output`
- watches consumer files such as `codemation.config.ts`, `src/workflows`, and related source files
- republishes the consumer manifest on rebuild
- notifies the running Next host about successful or failed rebuilds
- starts the Next.js host from `@codemation/next-host`

This mode is intentionally different from monorepo framework authoring:

- it assumes Codemation packages are already built and distributed
- it watches **consumer code**, not the Codemation monorepo packages
- it is the mode external users will run after installing Codemation

## Rule of thumb

- use root `pnpm dev` when changing Codemation itself
- use consumer `pnpm dev` / `codemation dev` when changing workflows, config, or plugins in a consuming app

## Tests for the CLI and dev runtime

Automated coverage for the consumer output builder and runtime-dev helpers is documented in [dev-tooling-tests.md](./dev-tooling-tests.md).
