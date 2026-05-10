---
"@codemation/core": patch
---

perf(core): fail fast on unbound required credential slots before node execution

`NodeExecutor` now checks all required (non-optional) credential slots via
`ctx.getCredential` before entering the retry runner or calling the node's
`execute`. This means a misconfigured credential surfaces as an immediate error
without burning the retry budget or running any node setup work. The session is
created and cached during the pre-flight, so the node itself pays no extra cost
when it subsequently calls `getCredential`. Optional slots (`optional: true` in
`getCredentialRequirements`) are skipped.

Also adds a `shouldRetry` predicate to `InProcessRetryRunner.run` and uses it
in `NodeExecutor` to skip all retry delays when the node throws a
`CredentialUnboundError` (or an error whose `.cause` is one). Previously, nodes
like `AIAgent` that check credentials inside `execute` rather than via
`getCredentialRequirements` would burn their full retry budget (e.g. 3 × 2 s
for AI agents) before surfacing the "slot not bound" error.
