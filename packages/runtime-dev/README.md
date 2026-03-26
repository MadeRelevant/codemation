# `@codemation/runtime-dev`

**Development runtime** child process: HTTP server that loads built consumer output, serves Codemation API routes, and exposes the workflow WebSocket server on loopback ports chosen by `@codemation/dev-gateway`. It is **not** used for production `serve web`.

## At a glance (monorepo / dev stack)

```
  apps/test-dev  ·  consumer repos
         │
         │  codemation dev
         ▼
  ┌──────────────┐      spawns       ┌─────────────────┐
  │ @codemation/ │ ───────────────►  │ @codemation/    │
  │ cli          │                  │ dev-gateway     │  ◄── browser (stable URL)
  └──────────────┘                  └────────┬─────────┘
                                           │ spawns / restarts
                                           ▼
                                  ┌─────────────────┐
                                  │ @codemation/    │  ◄── THIS PACKAGE
                                  │ runtime-dev     │     (codemation-runtime-dev)
                                  │                 │
                                  │ · load consumer │
                                  │ · Codemation    │
                                  │   application   │
                                  │ · engine + API  │
                                  │ · workflow WS   │
                                  └─────────────────┘
                                           ▲
                                           │ optional parallel
  ┌─────────────────┐                      │ (framework mode)
  │ @codemation/    │ ─────────────────────┘
  │ next-host       │   Next dev UI (separate process; gateway proxies)
  └─────────────────┘

  Production path: codemation serve web → next start + host — not runtime-dev.
```

**Role:** one **short-lived process** that holds the dev engine and HTTP/WS surface; **dev-gateway** keeps a stable port and recycles this child when your consumer code rebuilds.

## Install

```bash
pnpm add @codemation/runtime-dev@^0.0.0
# or
npm install @codemation/runtime-dev@^0.0.0
```

## When to use

This package is a dependency of **`@codemation/cli`** for `codemation dev`. Use it directly only if you are reproducing or extending the dev stack (for example in the monorepo or custom tooling).

## Usage

Binary name (see `package.json` `"bin"`):

```bash
codemation-runtime-dev
```

In normal workflows the CLI starts this process for you with the right env and ports. Unit tests live under `test/`; run `pnpm --filter @codemation/runtime-dev test` or the repo root `pnpm run test:unit`.
