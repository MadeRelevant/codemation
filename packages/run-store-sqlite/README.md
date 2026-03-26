# `@codemation/run-store-sqlite`

**SQLite** persistence for run state using **better-sqlite3**. Suitable for single-node or lightweight deployments where Postgres is not required for the run store.

## Install

```bash
pnpm add @codemation/run-store-sqlite@^0.0.0
# or
npm install @codemation/run-store-sqlite@^0.0.0
```

Native module: ensure your Node version and platform match **better-sqlite3** build requirements.

## When to use

Choose this package for local tools, embedded scenarios, or small installs that still need durable run history without standing up Postgres for that concern.

## Usage

```ts
import { SqliteRunStateStore } from "@codemation/run-store-sqlite";
```

Inject or register the factory where the host expects a run state store implementation, passing a filesystem path or connection options as required by the factory API.
