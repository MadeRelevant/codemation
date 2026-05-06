---
"@codemation/core-nodes-msgraph": minor
---

Split `msgraph-oauth` credential type into two focused types: `msgraph-mail-oauth` (Outlook/mail scopes) and `msgraph-drive-oauth` (OneDrive/SharePoint/Excel scopes). All mail nodes now require `msgraph-mail-oauth`; all drive and Excel nodes require `msgraph-drive-oauth`. This prevents scope mismatch errors when users connect with mail-only or drive-only permissions.
