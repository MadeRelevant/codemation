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

## Persistence: TCP PostgreSQL vs SQLite

Codemation now maintains **two** Prisma tracks:

- **PostgreSQL** for production/shared-database deployments.
- **SQLite** for local, single-process development.

You can run the host against either:

- **TCP PostgreSQL** — a normal `postgresql://` or `postgres://` URL (Docker, managed cloud, CI services). Use this for production, shared databases, and any deployment where **multiple processes** need the same database (API + workers, horizontal scale).
- **SQLite** — a local file-backed database (default relative path `.codemation/codemation.sqlite` in the consumer app). **Single-process**; ideal for local dev, quick scaffolding, and tests that do not need a shared server.

### Configuration

In `codemation.config.ts`, `runtime.database` accepts:

| Field            | Meaning                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `kind`           | `"postgresql"` or `"sqlite"` (if omitted, inferred from `url` or defaults to SQLite when no postgres URL is present).     |
| `url`            | Required when using TCP Postgres (`postgresql://…`).                                                                      |
| `sqliteFilePath` | Relative to the **consumer root** or absolute; used when `kind` is `"sqlite"` (default: `.codemation/codemation.sqlite`). |

Environment overrides (optional; persistence is primarily defined in **`codemation.config.ts`** — use `process.env` **inside** that file if you want `.env` to supply values):

- **`CODEMATION_DATABASE_KIND`** — `postgresql` or `sqlite` to force kind.
- **`CODEMATION_SQLITE_FILE_PATH`** — Path to the SQLite database file (relative to consumer root or absolute).

### Migrations

`codemation db migrate` and startup migrations both run **`prisma migrate deploy`** through the host Prisma config: TCP Postgres uses your `runtime.database.url`, while SQLite uses the configured local database file and its own SQLite migration history.

### Scheduler and SQLite

**BullMQ** (non-local scheduler) requires a **shared** PostgreSQL database. The host **fails fast** at bootstrap if the scheduler is BullMQ and persistence is SQLite. Set `runtime.database` to TCP Postgres when `REDIS_URL` / BullMQ is enabled. The **local** in-process scheduler is compatible with SQLite.

### Integration tests

Point the suite at SQLite or TCP Postgres by setting **`DATABASE_URL`** for the harness factory (`file:/tmp/codemation.sqlite` vs `postgresql://…`) and merging the resulting database into **`CodemationConfig.runtime.database`** (see `mergeIntegrationDatabaseRuntime` in host tests). CI can use a matrix: SQLite vs a Postgres service.

### Gitignore

Ignore the local database file (for example `.codemation/codemation.sqlite`) in consumer repos so SQLite state is not committed.

## Dual Prisma tracks

The host keeps separate Prisma schema, generated client, and migration tracks for PostgreSQL and SQLite.

- `prisma/schema.postgresql.prisma` and `prisma/migrations/` are the shared-database production path.
- `prisma/schema.sqlite.prisma` and `prisma/migrations.sqlite/` are the local-dev SQLite path.
- `prisma.config.ts` selects the correct track via `CODEMATION_PRISMA_PROVIDER`, while runtime migration code injects the matching provider automatically.
