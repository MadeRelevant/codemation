# Dev gateway architecture

This document defines responsibility boundaries and event contracts for Codemation’s simplified dev stack. It replaces the previous mix of Next-hosted runtime swapping, runtime-dev `/dev/*` control-plane reloads, and manifest hot-swap inside a long-lived process.

## Processes and roles

| Process                                                | Responsibility                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next dev** (`next dev` in `@codemation/next-host`)   | Framework-author UI only: pages, assets, HMR. It does not own consumer runtime lifecycle.                                                                                                                                                       |
| **Codemation dev gateway** (`@codemation/dev-gateway`) | Stable browser-facing HTTP/WebSocket surface for dev: proxies `/api/*` and workflow WebSocket upgrades to the **current** runtime child; exposes dev health and dev-event broadcasts; supervises the runtime child (spawn, restart, readiness). |
| **Runtime child** (`@codemation/runtime-dev` binary)   | Disposable process: loads `AppConfig`, builds an app container, starts the frontend runtime services, and runs `WorkflowWebsocketServer` on loopback ports. No in-process engine swap or manifest revision hot-swap.                            |

## Dev modes

### Framework dev (monorepo / `apps/test-dev`)

- **Command**: `pnpm codemation dev --watch-framework` (see `apps/test-dev`).
- **Processes**: Next dev + dev gateway + runtime child (child is spawned by the gateway).
- **Watch**: Consumer output builder + plugin discovery remain in the CLI; rebuild completion triggers a **gateway-driven child restart**, not `POST /dev/runtime` on the runtime.

### Consumer dev (external projects)

- **Command**: `codemation dev`.
- **Processes**: The CLI starts `next start` for `@codemation/next-host` on a loopback port (requires a prior `next build` of that package), then the **dev gateway** on the public port. The gateway sets `CODEMATION_DEV_UI_PROXY_TARGET` so non-`/api` HTTP and non-API WebSocket upgrades are proxied to Next, while `/api/*` and workflow WebSocket traffic go to the runtime child.
- **Watch**: The CLI’s consumer output builder watches consumer files and notifies the gateway; the gateway restarts the runtime child after a successful rebuild.

## Port and routing model

- The gateway listens on **`CODEMATION_DEV_GATEWAY_HTTP_PORT`** (HTTP + WebSocket upgrades on the same port).
- The runtime child listens on **private** loopback ports for HTTP (`CODEMATION_RUNTIME_HTTP_PORT`) and workflow WebSocket (`CODEMATION_WS_PORT`); these are not browser-facing.
- **Next** (framework mode) sets **`CODEMATION_RUNTIME_DEV_URL`** to the gateway base URL. The App Router catch-all proxies `/api/*` to the gateway (existing path rules).
- The browser uses **`NEXT_PUBLIC_CODEMATION_WS_PORT`** equal to the **gateway** port so workflow WebSocket traffic is proxied through the gateway while the child process restarts behind it.

## Event contracts

### Gateway → browser (dev WebSocket)

Path: `/api/dev/socket` (see `ApiPaths.devGatewaySocket()`).

JSON messages (examples):

- `{ "kind": "devBuildStarted" }` — consumer rebuild began; UI may show refreshing state.
- `{ "kind": "devBuildFailed", "message": string }` — rebuild failed.
- `{ "kind": "gateway", "kind": "childRestarting" }` — runtime child is being restarted (optional diagnostic).

Authorization: same rules as other dev routes (`CODEMATION_DEV_SERVER_TOKEN` header on HTTP notify; dev WebSocket may be loopback-only in development).

### CLI → gateway (HTTP)

`POST /api/dev/notify` with JSON:

- `{ "kind": "buildStarted" }`
- `{ "kind": "buildCompleted", "buildVersion": string }` — gateway restarts the runtime child after a successful consumer build.
- `{ "kind": "buildFailed", "message": string }`

### Runtime child → browser (workflow WebSocket, unchanged protocol)

After each child boot, the runtime publishes **`devBuildCompleted`** per workflow room on the workflow WebSocket so canvases refetch (same message kinds as today: `devBuildCompleted` with `workflowId` + `buildVersion`).

## Non-goals

- No in-process runtime swap for a new manifest revision.
- No `POST /dev/runtime` or `/dev/reload` as the primary dev coordination mechanism.
- No “tolerate 404/503” for dev coordination HTTP calls.

## Production

Production uses **`codemation build`** and **`codemation serve web` / `codemation serve worker`** with no dev gateway, watchers, or dev-only control routes.
