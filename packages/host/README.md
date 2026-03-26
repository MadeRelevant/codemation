# `@codemation/host`

The **framework host**: application composition (`CodemationApplication`), HTTP/WebSocket gateway (Hono), persistence (Prisma/Postgres), plugin and workflow discovery, shared React UI shell pieces, and server/client **subpath bundles** so Next.js and Node servers only import what they need.

## Install

```bash
pnpm add @codemation/host@^0.0.0
# or
npm install @codemation/host@^0.0.0
```

## When to use

Depend on this package when you embed Codemation in a custom server, extend the host, or build tooling that must open the same application graph as production. Browser bundles should use `@codemation/host/client` (and related entry points), not the full server graph.

## Usage

Root re-exports types and `CodemationApplication` for programmatic hosting:

```ts
import { CodemationApplication, type CodemationApplicationConfig } from "@codemation/host";
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
