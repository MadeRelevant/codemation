---
"@codemation/host": minor
"@codemation/next-host": minor
---

Stream telemetry spans over WebSocket transport, eliminating HTTP polling.

**Backend (@codemation/host):**

- Added `TelemetrySpanPublisher` interface + `NoOpTelemetrySpanPublisher` default.
- Added `telemetryEvent` variant to `WorkflowWebsocketMessage` carrying `TelemetrySpanUpsert`.
- New `TelemetrySpanWebsocketRelay` class publishes each span upsert to a per-run room (`run:<runId>`) after it is committed to persistent storage.
- `OtelExecutionTelemetryFactory` injects `TelemetrySpanPublisher` (defaults to no-op when unregistered).
- `StoredTelemetrySpanScope.upsert()` calls the publisher after the span store write so reconnect HTTP catch-up and WS pushes are consistent.

**Frontend (@codemation/next-host):**

- `useWorkflowRealtimeInfrastructure` handles `kind: "telemetryEvent"` messages via `applyTelemetrySpanEvent`, which merges spans into the `telemetry-run-trace` query cache by `spanId` (deduped, sorted by `startTime`).
- New `retainRunSubscription` API manages per-run WS room subscribe/unsubscribe with reference counting.
- Auto-unsubscribe from run rooms when the tab is hidden for ≥ 5 minutes (Page Visibility API); re-subscribes on tab return.
- `useTelemetryRunTraceQuery` drops HTTP polling (`refetchInterval: false`); refetches once on WS reconnect for catch-up.
- `resolveTelemetryTraceRefetchIntervalMs` is now a no-op (always returns `false`) — retained for call-site compatibility.
