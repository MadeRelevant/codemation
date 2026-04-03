# `create-codemation`

Scaffolds a **Codemation consumer application** (config stub, workflows folder, dependencies). Published as the unscoped npm initializer **`create-codemation`** so users can run `npm create codemation`.

## Install / run

```bash
npm create codemation@latest
pnpm create codemation
yarn create codemation
```

## When to use

Use this when starting a **new consumer repo** that will define `codemation.config.ts` and AI automatino workflows and run the stack via `@codemation/cli`.

## Usage

```bash
npm create codemation@latest my-app -- --template default
```

- **`[directory]`** — target folder (default: `codemation-app`).
- **`--template <id>`** — `default` or `plugin` (see `templates/` in this package).
- **`--list-templates`** — print template ids and exit.
- **`--force`** — allow writing into a non-empty directory (overwrites on conflict).
- **`--non-interactive`** / **`--no-interaction`** / **`-y` / `--yes`** — skip prompts and optional first-user setup; print manual next steps instead.

**Engines:** Node >= 20.

Templates list `@codemation/*` as **`0.0.x`** so new projects can **`pnpm upgrade`** within the pre-1.0 line without bumping fixed versions on every release.

Development in this monorepo: `pnpm --filter create-codemation build`, `pnpm --filter create-codemation test`, and run `node packages/create-codemation/bin/create-codemation.js /tmp/out --template default` to exercise the binary locally.
