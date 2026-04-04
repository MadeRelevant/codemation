# `@codemation/host`

The **framework host**: app-config loading, app-container composition, HTTP/WebSocket gateway (Hono), persistence (Prisma/Postgres), plugin and workflow discovery, shared React UI shell pieces, and server/client **subpath bundles** so Next.js and Node servers only import what they need.

## Install

```bash
pnpm add @codemation/host@^0.0.0
# or
npm install @codemation/host@^0.0.0
```

## When to use

Depend on this package when you embed Codemation in a custom server, extend the host, or build tooling that must open the same application graph as production. Browser bundles should use `@codemation/host/client` (and related entry points), not the full server graph.

## Usage

Root re-exports the container-oriented hosting surface:

```ts
import { AppContainerFactory, AppConfigFactory } from "@codemation/host";
```

Common subpaths (see `package.json` `exports`):

| Import                                | Role                       |
| ------------------------------------- | -------------------------- |
| `@codemation/host/server`             | Hono/server wiring         |
| `@codemation/host/next/server`        | Next.js server integration |
| `@codemation/host/client`             | Browser/client bundle      |
| `@codemation/host/consumer`           | Consumer-app helpers       |
| `@codemation/host/credentials`        | Credential-related surface |
| `@codemation/host/persistence`        | Persistence layer entry    |
| `@codemation/host/dev-server-sidecar` | Dev-time sidecar/guards    |

The `development` condition in `exports` can resolve TypeScript sources during local work; published builds use `dist`.

## Auth and sessions

`@codemation/host` now owns the browser auth/session contract.

- The backend issues and verifies the session cookie.
- The Next.js UI shell calls backend auth routes and does not bootstrap its own Prisma-backed auth adapter.
- OAuth/OIDC entrypoints start from the host-owned route surface as well.

Primary routes:

| Route                                 | Purpose                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/auth/session`               | Return the current principal JSON or `null` and issue the CSRF cookie when needed.         |
| `POST /api/auth/login`                | Local email/password sign-in; sets the backend session cookie.                             |
| `POST /api/auth/logout`               | Clear the backend session cookie.                                                          |
| `GET /api/auth/oauth/:provider/start` | Start the browser redirect for OAuth/OIDC providers configured in `CodemationConfig.auth`. |

Important env/config notes:

- `AUTH_SECRET` signs the backend-issued session token.
- `CODEMATION_PUBLIC_BASE_URL` is the public origin the host should use when it must generate redirects (dev tooling sets this for packaged `codemation dev`).
- `CODEMATION_UI_AUTH_ENABLED=false` disables the UI login gate intentionally; do not use it as a production shortcut.

### No legacy dual-stack auth

There is no dual-cookie or dual-route compatibility layer. Consumers should migrate to the backend-owned `/api/auth/*` surface in one step.

## Persistence: TCP PostgreSQL vs PGlite

Codemation uses a **single** Prisma schema (`provider = "postgresql"`). You can run it against either:

- **TCP PostgreSQL** — a normal `postgresql://` or `postgres://` URL (Docker, managed cloud, CI services). Use this for production, shared databases, and any deployment where **multiple processes** need the same database (API + workers, horizontal scale).
- **PGlite** — embedded Postgres via [`@electric-sql/pglite`](https://github.com/electric-sql/pglite), with the Prisma adapter. Data lives under a directory on disk (default relative path `.codemation/pglite` in the consumer app). **Single-process**; ideal for local dev, quick scaffolding, and tests that do not need a shared server.

### Configuration

In `codemation.config.ts`, `runtime.database` accepts:

| Field           | Meaning                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `kind`          | `"postgresql"` or `"pglite"` (if omitted, inferred from `url` or defaults to PGlite when no postgres URL is present). |
| `url`           | Required when using TCP Postgres (`postgresql://…`).                                                                  |
| `pgliteDataDir` | Relative to the **consumer root** or absolute; used when `kind` is `"pglite"` (default: `.codemation/pglite`).        |

Environment overrides (optional; persistence is primarily defined in **`codemation.config.ts`** — use `process.env` **inside** that file if you want `.env` to supply values):

- **`CODEMATION_DATABASE_KIND`** — `postgresql` or `pglite` to force kind.
- **`CODEMATION_PGLITE_DATA_DIR`** — Path to the PGlite data directory (relative to consumer root or absolute).

### Migrations

`codemation db migrate` and startup migrations both run **`prisma migrate deploy`**: TCP Postgres uses your `runtime.database.url`; PGlite temporarily exposes the data directory on a local Postgres protocol socket ([`@electric-sql/pglite-socket`](https://github.com/electric-sql/pglite-socket)) so the Prisma CLI applies the same migration history as server Postgres.

### Scheduler and PGlite

**BullMQ** (non-local scheduler) requires a **shared** PostgreSQL database. The host **fails fast** at bootstrap if the scheduler is BullMQ and persistence is PGlite. Set `runtime.database` to TCP Postgres when `REDIS_URL` / BullMQ is enabled. The **local** in-process scheduler is compatible with PGlite.

### Integration tests

Point the suite at PGlite or TCP Postgres by setting **`DATABASE_URL`** for the harness factory (`pglite:///…` vs `postgresql://…`) and merging the resulting database into **`CodemationConfig.runtime.database`** (see `mergeIntegrationDatabaseRuntime` in host tests). CI can use a matrix: PGlite vs a Postgres service.

### Gitignore

Ignore the embedded data directory (e.g. `.codemation/pglite`) in consumer repos so PGlite files are not committed.

## SQLite follow-up

SQLite is intentionally not part of the current runtime surface yet.

- The host still uses one PostgreSQL-shaped Prisma schema for both TCP Postgres and PGlite.
- Now that auth/session handling is backend-owned, a future local-only SQLite mode is easier to evaluate without dragging browser-auth persistence into the decision.
- Any SQLite work should be explicit about parity limits, dual Prisma-client generation, and how migration history is maintained across PostgreSQL and SQLite.
