---
"@codemation/canvas": minor
---

`WorkflowRealtimeProvider` now accepts an optional `skipDevHealthCheck` prop. When true, the provider initialises `workflowSocketEnabled=true` and skips the `/api/dev/health` polling effect — useful for consumers that already verified the host is reachable (e.g. control-plane's customer-ui after meta-fetch + token-mint). Avoids a one-tick delay before the first workflow-room subscription is sent.

Also promotes the `sent/queued subscribe for workflow ...` log from `debug` to `info` so DevTools shows the subscription send event, not just the server's `subscribed` ACK.
