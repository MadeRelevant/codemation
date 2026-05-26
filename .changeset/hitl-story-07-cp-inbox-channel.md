---
"@codemation/host": minor
---

feat(hitl): story 07 — ControlPlaneInboxChannel + inbound CP callback receiver

Implements the framework side of the workspace↔control-plane HITL integration:

- `ControlPlaneInboxChannel` — `InboxChannel` impl that pushes pending HITL tasks
  to the CP via HMAC-signed HTTP (`PairedFetch`). Includes `updateOnDecision` and
  `updateOnTimeout` to notify the CP when a task is resolved.
- `HitlCallbackHandler` — application handler for inbound CP→FW decision callbacks.
  Verifies workspace identity, routes timeout vs. decision bodies, and delegates to
  `DecideHumanTaskCommandHandler` for the actual state transition.
- `HitlInternalCallbackHonoApiRouteRegistrar` — registers
  `POST /internal/hitl/tasks/:taskId/callback`, HMAC-verified by the existing
  `InternalHmacAuthMiddleware`. Both classes registered conditionally when
  `PairingConfig` is present (managed mode only).
