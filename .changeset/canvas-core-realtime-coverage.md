---
"@codemation/canvas-core": patch
---

test(canvas-core/realtime): WebSocket harness + useWorkflowRealtimeInfrastructure coverage (Sprint 14 coverage)

Adds 57 tests across 10 describe blocks covering `useWorkflowRealtimeInfrastructure`:

- Dev-health polling gate (`/api/dev/health` interval, `skipDevHealthCheck` fast-path)
- Connect/reconnect lifecycle (open, close, error listeners; 4401 forced-token-refresh path)
- Message dispatch router (`handleRealtimeServerMessage` — all `kind` arms including runSaved, nodeQueued/Started/Completed/Failed, workflowChanged, devBuildStarted/Completed/Failed, telemetryEvent)
- Minimum visibility delay (300ms nodeCompleted/nodeFailed hold)
- Subscription management (`retainWorkflowSubscription`, `retainRunSubscription`, ref-counting, drain on open, reconnect re-subscribe)
- PageVisibilityIdleTimer auto-unsubscribe/re-subscribe on tab hide/show
- Dev-gateway socket buildState machine (building/idle/errored)

Achieves 90.25% line coverage on the target file (up from 0%).
