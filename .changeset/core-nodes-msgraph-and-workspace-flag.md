---
"create-codemation": minor
"@codemation/core-nodes-msgraph": minor
---

Add `--workspace` flag to `create-codemation` (rewrites `@codemation/*` dep ranges to `workspace:*` for in-monorepo plugin scaffolding).

Add `@codemation/core-nodes-msgraph` plugin: Microsoft Graph (O365) integration starting with an "On new mail" polling trigger. Lightweight flat module style, structured for future Graph node families (drive, excel, calendar). Uses `@microsoft/microsoft-graph-client` SDK and `@azure/msal-node` for OAuth2 token refresh.
