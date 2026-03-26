# `@codemation/dev-gateway`

A **development HTTP/WebSocket gateway** that sits in front of the disposable dev runtime: stable ports for the browser, proxying, and coordination with consumer rebuilds. It is started by **`codemation dev`**; you typically do not run it as a standalone user-facing tool.

## At a glance

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                         codemation dev (CLI)                              │
  └──────────────────────────────────────────────────────────────────────────┘
                    │ spawns                         │ may spawn
                    ▼                                ▼
           ┌────────────────┐                 ┌─────────────┐
           │  dev-gateway   │  HTTP + WS    │  next dev   │  (framework mode:
           │  (this pkg)    │◄──────────────│  (UI HMR)   │   browser hits gateway)
           │  127.0.0.1     │   proxy /     └─────────────┘
           └───────┬────────┘   upgrade
                   │
                   │ spawns + supervises child process
                   ▼
           ┌────────────────┐
           │ runtime-dev    │  ← disposable: restarts when consumer
           │ (@codemation/  │    rebuild completes (manifest / notify)
           │  runtime-dev)  │
           └───────┬────────┘
                   │
                   ▼
           Codemation API + workflow WebSocket
           (loopback ports; gateway forwards traffic)

  Legend: one stable “front door” (gateway) · hot-swappable engine child (runtime) · optional Next shell
```

## Install

```bash
pnpm add @codemation/dev-gateway@^0.0.0
# or
npm install @codemation/dev-gateway@^0.0.0
```

## When to use

Add or upgrade this package when you work on the Codemation CLI dev experience or need to reference the gateway from integration tests. Application code in consumer projects should go through the CLI, not import this package directly.

## Usage

The built entry is `dist/bin.js` (see package `main` / build scripts). The **`@codemation/cli`** package spawns it with the correct consumer root, ports, and environment. For local monorepo work:

```bash
pnpm --filter @codemation/dev-gateway build
```

There is no stable programmatic public API beyond what the CLI uses; treat releases as coupled to `@codemation/cli` versions.
