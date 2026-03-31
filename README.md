# Codemation

[![CI](https://github.com/MadeRelevant/codemation/actions/workflows/ci.yml/badge.svg)](https://github.com/MadeRelevant/codemation/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/MadeRelevant/codemation/graph/badge.svg?token=DQ1I6NK2LM)](https://codecov.io/gh/MadeRelevant/codemation)
[![npm @codemation/cli](https://img.shields.io/npm/v/@codemation/cli?label=npm%20%40codemation%2Fcli&logo=npm)](https://www.npmjs.com/package/@codemation/cli)

**Codemation** is a **code-first** automation framework for teams that want to ship **AI and agentic workflows** without rebuilding the same plumbing every time.

You focus on **what the workflow does** (steps, branches, tools, models). The framework takes care of the **boring but essential** parts: **triggers** (manual, webhooks, integrations), **run lifecycle** and **retries**, **live progress** over WebSockets, a **visual canvas** and inspectors, **credential storage and binding**, users and auth hooks, and a **real host + API** you can run in dev and production—not a one-off script runner.

---

## Who it is for

- **AI / automation teams** building internal tools, copilots, or customer-facing flows in **TypeScript**.
- Teams that are tired of gluing **schedulers, queues, secrets, and UIs** by hand for every new workflow.
- Engineers who want **reviewable, testable workflow code** (not only drag-and-drop) with an **operator-grade** shell around it.

---

## What you get out of the box

| Area                 | What Codemation handles                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Triggers & entry** | Webhooks, manual runs, pluggable trigger nodes (e.g. integrations), activation and routing without custom “watcher” services for every flow.  |
| **Execution**        | A real **workflow engine** (graph, state, continuations, policies) so runs are observable and recoverable—not fire-and-forget scripts.        |
| **Visibility**       | **Web UI** with workflow canvas, run detail, and live updates; **WebSocket** rooms keyed by workflow so clients see progress as nodes move.   |
| **Credentials**      | **Credential types, instances, and binding** to nodes through the host—so secrets are not copy-pasted through env vars for every integration. |
| **Operations**       | **CLI** for dev, build, migrate, and admin tasks; **Postgres-backed** persistence patterns for real deployments.                              |

You still write **workflow definitions in code** (`codemation.config.ts`, workflow modules) and can extend behavior with **node packages**—the framework stays out of your business logic while owning the platform surface.

---

## Quick start (build your own app)

Scaffold a consumer project and wire official packages from npm:

```bash
npm create codemation@latest my-app
```

Then follow the generated README: environment, database, first user, and `npm run dev`. Options (including non-interactive scaffolding) are in [`packages/create-codemation/README.md`](packages/create-codemation/README.md).

---

## Requirements

- **Node.js** 20+

Use **pnpm** or **npm** in your consumer; the monorepo below standardizes on **pnpm** for framework development.

---

## Under the hood (technical snapshot)

Codemation is shipped as **npm packages** (`@codemation/core`, `@codemation/host`, `@codemation/cli`, built-in nodes, optional integrations). At a high level:

| Piece                            | Role                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------- |
| **Engine** (`@codemation/core`)  | Execution model, workflow DSL, run state and events—**no** baked-in HTTP or UI. |
| **Host** (`@codemation/host`)    | Discovery, API, persistence, WebSockets, credential and run services.           |
| **UI** (`@codemation/next-host`) | Next.js shell for operators (canvas, runs, credentials, auth).                  |
| **CLI** (`@codemation/cli`)      | Dev gateway, runtime, build pipeline, and admin commands against your repo.     |

**Nodes** (built-in or plugins) are separate packages so new capabilities do not require forking the engine.

---

## Developing the framework (this repository)

Clone for **contributors** and **framework authors** working inside the monorepo:

```bash
pnpm install
pnpm dev
pnpm run dev:docs
```

That runs the sample app under [`apps/test-dev/`](apps/test-dev/) with framework dev mode, and starts the Fumadocs site only when you explicitly opt into `pnpm run dev:docs`. Full test and lint commands:

| Command                                | Purpose                           |
| -------------------------------------- | --------------------------------- |
| `pnpm build`                           | Build all packages                |
| `pnpm test`                            | Full test matrix + coverage paths |
| `pnpm run test:unit`                   | Fast unit pass                    |
| `pnpm run lint` / `pnpm run typecheck` | Quality gates                     |

Layout and package-level notes: [`docs/development-modes.md`](docs/development-modes.md), package READMEs under [`packages/`](packages/), and contributor rules in [`AGENTS.md`](AGENTS.md). Local registry smoke tests: [`tooling/verdaccio/README.md`](tooling/verdaccio/README.md).

---

## Documentation

| Doc                                                      | Use when                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| [`AGENTS.md`](AGENTS.md)                                 | You **change** the framework: architecture rules, tests, DI. |
| [`docs/development-modes.md`](docs/development-modes.md) | You work **inside** this repo vs a standalone consumer app.  |

---

## Contributing

See [`AGENTS.md`](AGENTS.md) and **`.cursor/skills/strict-oop-di/`** for how we structure code and tests.

---

## License

Licensing may vary by package; see each **`package.json`** under `packages/` and `apps/`.
