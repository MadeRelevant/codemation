---
"@codemation/core": minor
"@codemation/core-nodes": minor
"@codemation/host": minor
---

feat(hitl): story 05 — InboxChannel contract + auto-detecting inboxApproval node

Adds the `InboxChannel` interface and DI tokens to `@codemation/core`:

- `InboxChannel` — deliver/updateOnDecision/updateOnTimeout contract
- `InboxChannelResolverSeam` — host-side seam for picking local vs. CP channel
- `InboxChannelResolverToken`, `LocalInboxChannelToken`, `ControlPlaneInboxChannelToken`

Extends `ExecutionContext` with `resolve<T>(token: TypeToken<T>): T` so nodes can
reach host-side services without importing host code. `DefaultExecutionContextFactory`
accepts an optional `NodeResolver` as its 6th constructor parameter.

Adds `InboxChannelResolver` to `@codemation/host` — resolves the right channel at
runtime based on `PairingConfig` presence (managed vs. local mode). Registered in
`AppContainerFactory`.

Adds the `inboxApproval` node to `@codemation/core-nodes` — built with
`defineHumanApprovalNode` (story 04), auto-detects the channel via
`ctx.resolve(InboxChannelResolverToken)`, supports `${item.json.*}` templates in
title/body, and tags telemetry spans with the resolved channel kind.

Concrete channel implementations (local inbox: story 06, CP inbox: story 07) are
not included in this release.
