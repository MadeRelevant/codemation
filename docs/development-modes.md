# Development Modes

Codemation separates **framework author** dev (`codemation dev --watch-framework`) from the default **consumer** dev flow (`codemation dev`).

## 1. Framework author mode (monorepo)

Use this when working inside the Codemation monorepo (e.g. `apps/test-dev`).

From `apps/test-dev`:

```bash
pnpm dev
```

This runs `codemation dev --watch-framework` (set in `apps/test-dev/package.json`). Under the hood:

- The CLI owns one stable dev HTTP/WebSocket endpoint on the configured dev port.
- The CLI starts **`next dev`** in `@codemation/next-host` for UI HMR and points it at the stable dev endpoint via `CODEMATION_RUNTIME_DEV_URL`.
- On source changes, the CLI republishes consumer output when needed, rebuilds a fresh disposable API runtime in-process, swaps the stable proxy over atomically, and keeps workflow/dev websocket paths stable.

Root `pnpm dev` may still use Turbo to warm workspace packages; the Next dev server is **not** started by Turbo for `next-host`—the CLI owns `next dev` in framework mode.

## 2. Consumer mode (default `codemation dev`)

Use this for a standalone consumer project (no framework source checkout).

```bash
codemation dev
```

Default `codemation dev`. The CLI starts:

- `next start` for the packaged `@codemation/next-host` UI on a loopback port (requires **`pnpm --filter @codemation/next-host build`** or equivalent so `.next` exists).
- A stable CLI-owned dev endpoint on `PORT` / `CODEMATION_DEV_GATEWAY_HTTP_PORT` (default **3000**), which proxies non-`/api` traffic to that Next process and routes `/api/*` plus websocket paths to the currently active in-process API runtime.

There is **no** `next dev` in consumer mode (no framework HMR).

Framework UI HMR is opt-in via `codemation dev --watch-framework` (as in `apps/test-dev`).

## Rule of thumb

- Monorepo framework work: `codemation dev --watch-framework` + Next dev + stable CLI-owned runtime swapping.
- External consumer: `codemation dev` — one command, packaged UI + stable CLI-owned runtime swapping.

## Tests

See [dev-tooling-tests.md](./dev-tooling-tests.md) for CLI and runtime tests.
