---
"@codemation/canvas": minor
"@codemation/next-host": patch
---

Add `createWorkflowCanvasApiClient` factory to `@codemation/canvas`.

The factory creates a `WorkflowCanvasApiClient` that talks directly to a
workspace's HTTP API with configurable `apiBase` and `getToken`. Key behaviours:

- When `getToken` returns `null`, no `Authorization` header is sent and
  cookie/credentials auth is preserved (self-hosted mode).
- On HTTP 401, the client calls `getToken({ forceRefresh: true })` once and
  retries. After a second 401, the error is surfaced normally.

`WorkflowRealtimeProvider` and `useWorkflowRealtimeInfrastructure` gain an
optional `getWsToken` prop. When supplied, the JWT is appended as `?token=` on
the WebSocket URL. On close-code `4401` (token expired), the hook calls
`getWsToken({ forceRefresh: true })` and reconnects with exponential backoff
capped at 30 s.

`next-host` now wires the canvas using `createWorkflowCanvasApiClient` with
`apiBase: ""` and `getToken: () => null`, preserving current same-origin
cookie behaviour unchanged.
