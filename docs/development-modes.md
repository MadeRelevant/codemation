# Development Modes

Codemation separates **framework author** dev (Next HMR + gateway + runtime child) from **consumer** dev (gateway + runtime child only, no Next required). See [dev-gateway-architecture.md](./dev-gateway-architecture.md) for process boundaries.

## 1. Framework author mode (monorepo)

Use this when working inside the Codemation monorepo (e.g. `apps/test-dev`).

From `apps/test-dev`:

```bash
pnpm dev
```

This runs `codemation dev` with **`CODEMATION_DEV_MODE=framework`** (set in `apps/test-dev/package.json`). Under the hood:

- The **dev gateway** (`@codemation/dev-gateway`) listens on a dedicated port and proxies `/api/*` and workflow WebSocket traffic to a **runtime child** process (`@codemation/runtime-dev`).
- **`next dev`** runs in `@codemation/next-host` for UI HMR. The App Router proxies `/api/*` to the gateway via `CODEMATION_RUNTIME_DEV_URL`.
- The CLI **watches** consumer output, republishes the manifest on change, and **`POST`s** `/api/dev/notify` on the gateway so it can broadcast dev events and **restart** the runtime child after a successful build.

Root `pnpm dev` may still use Turbo to warm workspace packages; the Next dev server is **not** started by Turbo for `next-host`—the CLI owns `next dev` in framework mode.

## 2. Consumer mode (default `codemation dev`)

Use this for a standalone consumer project (no framework source checkout).

```bash
codemation dev
```

Default **`CODEMATION_DEV_MODE=consumer`**. The CLI starts:

- `next start` for the packaged `@codemation/next-host` UI on a loopback port (requires **`pnpm --filter @codemation/next-host build`** or equivalent so `.next` exists).
- The **dev gateway** on `PORT` / `CODEMATION_DEV_GATEWAY_HTTP_PORT` (default **3000**), which proxies non-`/api` traffic to that Next process and `/api/*` + workflow WebSocket upgrades to the runtime child.

There is **no** `next dev` in consumer mode (no framework HMR).

**Framework mode** is opt-in via `CODEMATION_DEV_MODE=framework` (as in `apps/test-dev`).

## Rule of thumb

- Monorepo framework work: `CODEMATION_DEV_MODE=framework` + Next dev + gateway + child.
- External consumer: `codemation dev` (consumer mode) — one command, gateway + child.

## Tests

See [dev-tooling-tests.md](./dev-tooling-tests.md) for CLI and runtime tests.
