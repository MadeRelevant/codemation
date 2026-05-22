---
"@codemation/host": patch
---

Add activation-time OAuth scope validation: workflows with bound OAuth credentials are now rejected at activation if the granted scopes do not cover the required scopes for the credential type.
