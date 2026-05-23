---
"@codemation/core-nodes-gmail": minor
---

Migrate all Gmail node credential slots from the legacy `gmail.oauth` type to `oauth.google.gmail`.

All four Gmail nodes (OnNewGmailTrigger, SendGmailMessage, ReplyToGmailMessage, ModifyGmailLabels) now declare `acceptedTypes: ["oauth.google.gmail"]` in their credential slot, aligning them with the unified OAuth credential type registered in Story 2.2. The `GmailCredentialTypes` class has been removed.
