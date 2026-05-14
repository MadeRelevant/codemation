---
"@codemation/host": minor
---

Add `GET /api/me` endpoint in managed-auth mode (Story A). Returns `{ userId, workspaceId }` from the bearer JWT principal. Only mounted when `auth.kind === "managed"`.
