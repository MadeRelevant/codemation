# `@codemation/cli`

The **Codemation command-line** package: parse arguments, wire a small composition root, and run **build**, **dev**, **serve**, and **user** subcommands against a **consumer project** (your app that defines `codemation.config.ts` and workflows).

It is intentionally **thin**: no DI container. [`CliProgramFactory`](./src/CliProgramFactory.ts) is the single place the object graph is constructed; command classes receive dependencies via constructors.

---

## How it fits in the monorepo

The CLI **orchestrates** other packages. It does not embed the full Next UI or engine—it **spawns** or **calls into** them as needed.

```text
  Consumer project (your repo)
  ├── codemation.config.ts
  ├── src/workflows/…
  └── .codemation/output/
      ├── build/              ← emitted JS + index.js (after promote)
      ├── staging/…           ← transient during a build
      └── current.json        ← manifest (from publish step, not from ensureBuilt alone)
           ▲
           │ paths + env
           │
  ┌────────┴────────────────────────────────────────────────────────────┐
  │                        @codemation/cli                                │
  │                                                                       │
  │   bin/codemation.js                                                   │
  │        │                                                              │
  │        ▼                                                              │
  │   CliBin.run()                                                        │
  │        │                                                              │
  │        ▼                                                              │
  │   CliProgramFactory.create()  ──►  CliProgram.run()  (Commander.js)  │
  │        │                              │                               │
  │        │                              ├── build    → BuildCommand     │
  │        │                              ├── dev      → DevCommand       │
  │        │                              ├── serve web  → ServeWebCommand│
  │        │                              ├── serve worker → ServeWorker… │
  │        │                              └── user create → UserCreate…   │
  │        │                                                              │
  └────────┼────────────────────────────────────────────────────────────┘
           │
           │  uses / spawns
           ▼
  ┌────────────────────┬─────────────────────┬────────────────────────────┐
  │ @codemation/host   │ @codemation/next-host│ @codemation/dev-gateway   │
  │ (plugin discovery, │ (production:        │ (dev: HTTP gateway binary) │
  │  logging, workflow │  `pnpm exec next    │                            │
  │  path helpers)     │   start` cwd)      │                            │
  └─────────┬──────────┴──────────┬──────────┴─────────────┬────────────────┘
            │                     │                      │
            │                     │                      │
            ▼                     │                      ▼
  ┌───────────────────┐           │            ┌─────────────────────┐
  │ Engine & types     │           │            │ @codemation/        │
  │ via host (not a    │           │            │ runtime-dev         │
  │ direct cli dep)    │           │            │ (dev child process) │
  └───────────────────┘           │            └─────────────────────┘
                                    │
                                    ▼
                          ┌───────────────────┐
                          │ @codemation/      │
                          │ worker-cli        │
                          │ (`serve worker`)  │
                          └───────────────────┘
```

**Reading the diagram**

- **Vertical flow**: the binary loads `CliProgramFactory`, builds `CliProgram`, then Commander dispatches to a **command class** (`commands/*`).
- **Horizontal row**: shared **libraries** the CLI imports for discovery, logging, and path logic; **next-host** is where `serve web` runs the production Next server; **dev-gateway** + **runtime-dev** are the dev-time split (gateway + disposable runtime child).
- **Consumer tree**: `ConsumerOutputBuilder` transpiles sources into `.codemation/output/build` and writes the entry `index.js`; `ConsumerBuildArtifactsPublisher` writes plugins and updates the manifest consumed by the host at runtime.

For **framework author vs consumer** dev modes (`CODEMATION_DEV_MODE`), see [`docs/development-modes.md`](../../docs/development-modes.md) at the repo root.

---

## Entry points

| Entry                                 | Role                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bin/codemation.js` (package `"bin"`) | Production entry: loads `reflect-metadata`, runs [`CliBin`](./src/CliBin.ts).                                                                                               |
| `src/bin.ts`                          | Bundled bin artifact used by `tsdown` for the same behavior.                                                                                                                |
| Programmatic                          | Import [`CliProgramFactory`](./src/CliProgramFactory.ts) and `create()`, or compose `CliProgram` with test doubles. Public exports are in [`src/index.ts`](./src/index.ts). |

---

## Commands (overview)

| Command                    | Purpose                                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codemation dev` (default) | Dev session: ports, lock, optional UI proxy, spawn **dev-gateway** + **runtime-dev**, watch consumer sources and restart on change.                                                                                    |
| `codemation build`         | Emit consumer output under `.codemation/output/build`, discover plugins, write manifest.                                                                                                                               |
| `codemation serve web`     | Run consumer build if needed, then **`next start`** from `@codemation/next-host` with env pointing at the manifest.                                                                                                    |
| `codemation serve worker`  | Spawn **`@codemation/worker-cli`** in the consumer root.                                                                                                                                                               |
| `codemation user create`   | Create/update a DB user when auth is local (uses consumer config / `DATABASE_URL`). Dispatches `UpsertLocalBootstrapUserCommand` via the host `CommandBus` (password minimum 8 characters, same as invite acceptance). |
| `codemation user list`     | List users via `ListUserAccountsQuery` and the host `QueryBus` (same auth/DB requirements as `user create`).                                                                                                           |

Programmatic bootstrap: [`CodemationCliApplicationSession`](./src/bootstrap/CodemationCliApplicationSession.ts) opens `CodemationApplication` with `bootCli` (no HTTP/WebSocket); use `getCommandBus()` for other admin commands later.

Use `codemation --help` and `codemation <command> --help` for flags (`--consumer-root`, build targets, etc.).

---

## Consumer build pipeline (summary)

1. **`ConsumerOutputBuilder.ensureBuilt()`** discovers config and workflows, transpiles with TypeScript, stages under `.codemation/output/staging/<version>-<uuid>/`, then **renames** to `.codemation/output/build/` (atomic promote).
2. **Watch** (dev): debounced chokidar rebuilds; incremental builds copy forward from the last promoted `build/` when possible.
3. **Publish** (`ConsumerBuildArtifactsPublisher`): writes `plugins.js` and **`current.json`** manifest (build version, paths). The host reads the manifest path from env when you run `serve web` or dev.

---

## Production-oriented build flags

`codemation build` and `codemation serve web` (consumer build step) accept:

| Flag                          | Purpose                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `--no-source-maps`            | Omit `.js.map` next to emitted workflow modules.              |
| `--target es2020` \| `es2022` | ECMAScript target for emitted workflow JS (default `es2022`). |

Programmatically, map the same flags with [`ConsumerBuildOptionsParser`](./src/build/ConsumerBuildOptionsParser.ts) or pass [`ConsumerBuildOptions`](./src/consumer/consumerBuildOptions.types.ts) into [`ConsumerOutputBuilder`](./src/consumer/ConsumerOutputBuilder.ts).

---

## Tests

Unit tests live under `test/` (Vitest).

```bash
pnpm --filter @codemation/cli test
```

From the repository root they are also included in the shared unit suite:

```bash
pnpm run test:unit
```

### What is covered

- **`ConsumerBuildOptionsParser`**: maps CLI flags (`--no-source-maps`, `--target`) to `ConsumerBuildOptions`.
- **`ConsumerOutputBuilder` + build options**: default build emits `.js.map` for transpiled workflows; `sourceMaps: false` omits them.
- **`ConsumerOutputBuilder`**
  - **Full build** (`ensureBuilt`): stage under `.codemation/output/staging/…`, then promote to `.codemation/output/build/`.
  - **Watch + incremental**: after a full build, a single workflow file change triggers a rebuild promoted to the same `build/` path (chokidar + debounce; tests set `CHOKIDAR_USEPOLLING`).

Tests use a temporary consumer fixture (`codemation.config.ts` + `src/workflows`) and do not mock TypeScript transpilation or host discovery helpers.
