# `@codemation/runtime-dev`

Development-only HTTP server that loads built consumer output via Vite, hosts the Codemation API for `codemation dev` when the CLI runs the runtime worker, and exposes `/dev/*` endpoints for build notifications and metrics.

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
- **`RuntimeDevMetrics`**: bounded sample buffers for reload and engine-swap timings.

These tests avoid spinning up the full Vite + `CodemationApplication` stack; that path remains covered by manual dev workflows and higher-level integration elsewhere.
