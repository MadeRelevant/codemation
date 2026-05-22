---
"@codemation/host": minor
---

Add ManagedOAuthFlowExecutor for managed (paired) mode. Delegates the OAuth dance to the control plane over HMAC-signed calls, keeping client secrets off the host. AppContainerFactory now selects ManagedOAuthFlowExecutor when pairing is configured and LocalOAuthFlowExecutor otherwise.
