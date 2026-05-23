---
"@codemation/next-host": patch
---

fix(next-host): open create dialog when canvas credential-edit toolbar is clicked for unbound slot

When `pendingCredentialEditForNodeId` is set (via the canvas node credential-key toolbar button)
and no credential is yet bound on any slot for that node, the handler previously silently consumed
the request. Now it opens `openCreateDialog` filtered to the first slot's accepted types, so the
user can create a new credential directly instead of seeing no response.
