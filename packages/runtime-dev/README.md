# `@codemation/runtime-dev`

Development-only HTTP server used as the **runtime child** behind the dev gateway: loads built consumer output via Vite, hosts the Codemation Hono API, and runs the workflow WebSocket server on loopback ports assigned by `@codemation/dev-gateway`.

Reload notifications and consumer rebuild coordination are handled by the **gateway** (`POST /api/dev/notify` on the gateway process) and process restarts—not by in-process hot-swap inside this package.

## Tests

Unit tests live under `test/` and run on Node with Vitest.

```bash
pnpm --filter @codemation/runtime-dev test
```

From the repository root they are also included in the shared unit suite:

```bash
pnpm run test:unit
```

### What is covered

- **`DevelopmentRuntimeRouteGuard`** (`@codemation/host/dev-server-sidecar`): loopback authorization, optional `CODEMATION_DEV_SERVER_TOKEN` behavior, and `parseSignalFromPayload` for `buildStarted` / `buildCompleted` / `buildFailed`.
- **`RuntimeDevMetrics`**: bounded sample buffers for reload and engine-swap timings (legacy metrics retained for diagnostics).

These tests avoid spinning up the full Vite + `CodemationApplication` stack; that path remains covered by manual dev workflows and higher-level integration elsewhere.
