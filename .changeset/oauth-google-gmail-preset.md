---
"@codemation/core-nodes-gmail": minor
---

Add `oauth.google.gmail` credential type preset — covers all Gmail scopes, takes `clientId` as a public field and `clientSecret` as a secret field, and returns a `GmailSession` from `createSession`. Registered automatically by the `@codemation/core-nodes-gmail` plugin. One instance satisfies both Gmail trigger nodes and the Gmail MCP server.
