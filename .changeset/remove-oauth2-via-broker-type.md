---
"@codemation/host": minor
---

Remove the `host.oauth2-via-broker` credential type and all related broker-upsert machinery. The broker is now an implementation detail of `ManagedOAuthFlowExecutor`; the credential type catalog only contains mode-agnostic types.
