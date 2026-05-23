---
"@codemation/core-nodes-gmail": minor
---

Narrow the default Gmail OAuth scope set to the n8n-style minimum: `gmail.modify` + `gmail.labels`. `gmail.modify` is a superset of `gmail.readonly` + `gmail.send` + `gmail.compose` for messages and threads; `gmail.labels` is required separately to create or delete custom labels. Drops scope overreach on the consent screen.

Add tokeninfo introspection (`oauth2.googleapis.com/tokeninfo`) to the credential's `test()` health check. When the live token's actual scope diverges from the stored `grantedScopes` (e.g. Google issued a downgraded grant despite a broader request), the test now fails with a clear "disconnect and reconnect" message and surfaces both `storedScopes` and `actualScopes` in `details`.

Breaking — existing connected credentials will need to disconnect and reconnect to obtain a fresh token aligned with the narrowed scope set.
